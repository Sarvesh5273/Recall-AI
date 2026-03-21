// TODO: Migrate fetch() calls to use apiFetch() from ./api for automatic 401 handling
import { database } from '../database';
import PendingScan from '../database/PendingScan';
import Quarantine from '../database/Quarantine';
import { API_BASE_URL } from '@env';
import { Q } from '@nozbe/watermelondb';
import RNFS from 'react-native-fs';
import Fuse from 'fuse.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// master_seed.json removed — catalog is now in WatermelonDB (synced from backend)

const MAX_RETRIES = 5;
const AUTO_MATCH_THRESHOLD = 0.35;

let isSyncProcessing = false;

// ─── LOCAL EDGE MATCHER ───────────────────────────────────────────────────────
const tryLocalAutoMatch = async (
  rawText: string,
  quantity: number,
  unit: string,
  scanType: string,
  shopId: string,
  token: string | null
): Promise<boolean> => {
  try {
    const localCustoms = await database.get('custom_skus').query().fetch();
    if (localCustoms.length === 0) return false;

    const customData = localCustoms.map((c: any) => ({
      uid: c.uid,
      name: c.standard_name,
      aliases: [c.standard_name.toLowerCase()],
    }));

    const fuse = new Fuse(customData, {
      keys: ['name', 'aliases'],
      threshold: AUTO_MATCH_THRESHOLD,
      includeScore: true,
    });

    const results = fuse.search(rawText);
    if (results.length === 0) return false;

    const best = results[0];
    const matchScore = Math.round((1 - (best.score || 0)) * 100);
    console.log(`Auto-match: "${rawText}" → "${best.item.name}" (${matchScore}%)`);

    const payload = {
      shop_id: shopId,
      uid: best.item.uid,
      standard_name: best.item.name,
      quantity,
      unit,
      scan_type: scanType,
    };

    const response = await fetch(`${API_BASE_URL}/sync-mapped-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`Auto-match sync failed for "${rawText}": ${response.status}`);
      return false;
    }

    console.log(`Auto-matched & synced: "${rawText}" → "${best.item.name}"`);
    return true;

  } catch (err) {
    console.error('Local auto-match error:', err);
    return false;
  }
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── JOB POLLER ──────────────────────────────────────────────────────────────
// Polls /job-status/{jobId} every 5s until completed/failed or 2min timeout.
// Converts async backend response into the same shape as a sync success payload.
const pollJobStatus = async (jobId: string, token: string | null): Promise<any> => {
  const maxAttempts = 24; // 24 x 5s = 2 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>(res => setTimeout(() => res(), 5000));
    try {
      const res = await fetch(`${API_BASE_URL}/job-status/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        console.warn(`Job poll ${i + 1}/${maxAttempts}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      console.log(`Job poll ${i + 1}/${maxAttempts}: status=${data.status}`);
      if (data.status === 'completed') {
        return { status: 'success', data: data.result?.data || {} };
      }
      if (data.status === 'failed') {
        throw new Error(`Job ${jobId} failed on backend`);
      }
      // status is 'processing' or 'queued' — keep polling
    } catch (e: any) {
      if (e.message?.includes('failed on backend')) throw e;
      console.warn(`Job poll ${i + 1} error:`, e);
    }
  }
  throw new Error(`Job ${jobId} timed out after 2 minutes`);
};
// ─────────────────────────────────────────────────────────────────────────────

export const processOutboxQueue = async () => {
  if (isSyncProcessing) {
    console.log('Sync already running. Ignoring duplicate trigger.');
    return;
  }

  isSyncProcessing = true;

  try {
    const scansCollection = database.get<PendingScan>('pending_scans');
    const now = Date.now();

    // Zombie Recovery — reset scans stuck in 'syncing' for 30+ seconds
    const thirtySecsAgo = now - 30 * 1000;
    const zombies = await scansCollection.query(
      Q.where('status', 'syncing'),
      Q.where('next_retry_at', Q.lte(thirtySecsAgo))
    ).fetch();

    if (zombies.length > 0) {
      await database.write(async () => {
        for (const zombie of zombies) {
          await zombie.update(z => { z.status = 'pending'; });
        }
      });
      console.log(`Recovered ${zombies.length} zombie scans.`);
    }

    const pendingScans = await scansCollection.query(
      Q.where('status', 'pending'),
      Q.where('next_retry_at', Q.lte(now)),
      Q.sortBy('created_at', Q.asc)
    ).fetch();

    if (pendingScans.length === 0) return;

    for (const scan of pendingScans) {
      // Mark as syncing with 3-min protection window (covers 2-min poll timeout)
      await database.write(async () => {
        await scan.update(s => {
          s.status = 'syncing';
          s.nextRetryAt = Date.now() + 180 * 1000;
        });
      });

      try {
        const formData = new FormData();
        formData.append('file', { uri: scan.imageUri, type: 'image/jpeg', name: `scan_${scan.scanId}.jpg` } as any);
        formData.append('shop_id', scan.shopId);
        formData.append('scan_type', scan.scanType);
        formData.append('scan_id', scan.scanId);

        const token = await AsyncStorage.getItem('recall_token');

        const response = await fetch(`${API_BASE_URL}/process-ledger`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        // Scan limit exceeded — mark as failed, do NOT retry
        if (response.status === 403) {
          console.warn(`Scan limit reached for shop ${scan.shopId}.`);
          await database.write(async () => {
            await scan.update(s => {
              s.status = 'failed';
              s.retryCount = MAX_RETRIES;
            });
          });
          continue;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();

        // ── ASYNC JOB HANDLING ────────────────────────────────────────────
        // Backend returns {status: 'processing', job_id: '...'} for async jobs.
        // Poll until completed before marking scan as done.
        let finalPayload = payload;
        if (payload.status === 'processing' && payload.job_id) {
          console.log(`Job ${payload.job_id} queued — polling for result...`);
          finalPayload = await pollJobStatus(payload.job_id, token);
        }
        // ─────────────────────────────────────────────────────────────────

        if (finalPayload.status === 'success') {
          const quarantinedItems: any[] = finalPayload.data?.quarantined || [];

          // ── SMART TRIAGE ─────────────────────────────────────────────────
          const trulyUnknown: any[] = [];
          for (const item of quarantinedItems) {
            const autoMatched = await tryLocalAutoMatch(
              item.raw_text,
              item.quantity,
              item.unit,
              scan.scanType,
              scan.shopId,
              token
            );
            if (!autoMatched) trulyUnknown.push(item);
          }

          if (trulyUnknown.length < quarantinedItems.length) {
            console.log(
              `Smart Triage: auto-matched ${quarantinedItems.length - trulyUnknown.length}/${quarantinedItems.length} items.`
            );
          }
          // ─────────────────────────────────────────────────────────────────

          // Write quarantine items + destroy scan record
          await database.write(async () => {
            for (const item of trulyUnknown) {
              await database.get<Quarantine>('quarantine').create(qItem => {
                qItem.rawText = item.raw_text;
                qItem.quantity = item.quantity;
                qItem.unit = item.unit;
                qItem.scanType = scan.scanType;
                qItem.status = 'needs_review';
              });
            }
            await scan.destroyPermanently();
          });

          // Delete image file AFTER database transaction completes
          try {
            const fileExists = await RNFS.exists(scan.imageUri);
            if (fileExists) await RNFS.unlink(scan.imageUri);
          } catch (fsError) {
            console.error('File deletion failed (non-critical):', fsError);
          }
        }
      } catch (error) {
        console.error(`Sync failed for ${scan.scanId}:`, error);

        const backoffMinutes = Math.pow(2, scan.retryCount);
        const nextRetryTime = now + backoffMinutes * 60 * 1000;

        await database.write(async () => {
          await scan.update(s => {
            s.retryCount += 1;
            s.status = s.retryCount >= MAX_RETRIES ? 'failed' : 'pending';
            s.nextRetryAt = nextRetryTime;
          });
        });
      }
    }
  } catch (error) {
    console.error('Critical Queue Error:', error);
  } finally {
    isSyncProcessing = false;
  }
};