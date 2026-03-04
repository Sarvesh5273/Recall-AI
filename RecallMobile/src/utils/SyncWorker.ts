import { database } from '../database';
import PendingScan from '../database/PendingScan';
import Quarantine from '../database/Quarantine';
import { API_BASE_URL } from '@env';
import { Q } from '@nozbe/watermelondb';
import RNFS from 'react-native-fs'; // Required to prevent file leaks

const MAX_RETRIES = 5;

// ISSUE 5 FIX: The Singleton Guard prevents NetInfo and AppState from colliding
let isSyncProcessing = false;

export const processOutboxQueue = async () => {
  if (isSyncProcessing) {
    console.log("Sync already running. Ignoring duplicate trigger.");
    return; 
  }
  
  isSyncProcessing = true;

  try {
    const scansCollection = database.get<PendingScan>('pending_scans');
    const now = Date.now();

    // ISSUE 3 FIX: Zombie Recovery. 
    // If the app was killed mid-upload, 'syncing' rows get stuck forever.
    // Anything 'syncing' for more than 5 minutes gets reverted to 'pending'.
    const fiveMinsAgo = now - (5 * 60 * 1000);
    const zombies = await scansCollection.query(
      Q.where('status', 'syncing'),
      Q.where('created_at', Q.lte(fiveMinsAgo)) // Assuming created_at is updated on sync start
    ).fetch();

    if (zombies.length > 0) {
      await database.write(async () => {
        for (const zombie of zombies) {
          await zombie.update(z => { z.status = 'pending'; });
        }
      });
      console.log(`Recovered ${zombies.length} zombie scans.`);
    }

    // ISSUE 4 FIX: Exponential Backoff Query
    // Only fetch 'pending' items where it is currently past their next_retry_at time
    const pendingScans = await scansCollection.query(
      Q.where('status', 'pending'),
      Q.where('next_retry_at', Q.lte(now)),
      Q.sortBy('created_at', Q.asc) // FIFO Order
    ).fetch();

    if (pendingScans.length === 0) return;

    for (const scan of pendingScans) {
      // STATE TRANSITION: Lock to syncing
      await database.write(async () => {
        await scan.update(s => { 
            s.status = 'syncing'; 
            s.createdAt = new Date(); // Update timestamp for zombie detection
        });
      });

      try {
        const formData = new FormData();
        formData.append('file', { uri: scan.imageUri, type: 'image/jpeg', name: `scan_${scan.scanId}.jpg` } as any);
        formData.append('shop_id', scan.shopId);
        formData.append('scan_type', scan.scanType);
        formData.append('scan_id', scan.scanId); // The Backend Idempotency Key

        const response = await fetch(`${API_BASE_URL}/process-ledger`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const payload = await response.json();

        if (payload.status === "success") {
          const quarantinedItems = payload.data?.quarantined || [];
          
          await database.write(async () => {
            for (const item of quarantinedItems) {
              await database.get<Quarantine>('quarantine').create(qItem => {
                qItem.rawText = item.raw_text; 
                qItem.quantity = item.quantity; 
                qItem.unit = item.unit;         
                qItem.scanType = scan.scanType;
                qItem.status = 'needs_review';
              });
            }
            
            // ISSUE 2 FIX: Prevent Device Storage Leaks
            try {
                const fileExists = await RNFS.exists(scan.imageUri);
                if (fileExists) await RNFS.unlink(scan.imageUri);
            } catch (fsError) {
                console.error("File deletion failed:", fsError);
            }

            // Finally, destroy the row
            await scan.destroyPermanently();
          });
        }
      } catch (error) {
        console.error(`Sync failed for ${scan.scanId}:`, error);
        
        // ISSUE 4 FIX: Exponential Backoff Math
        // Retries: 1min, 2min, 4min, 8min...
        const backoffMinutes = Math.pow(2, scan.retryCount);
        const nextRetryTime = now + (backoffMinutes * 60 * 1000);

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
    console.error("Critical Queue Error:", error);
  } finally {
    // ALWAYS release the singleton lock
    isSyncProcessing = false;
  }
};