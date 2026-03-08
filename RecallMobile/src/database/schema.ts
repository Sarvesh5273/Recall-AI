import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const mySchema = appSchema({
  version: 6, // Bumped for catalog sync
  tables: [
    tableSchema({
      name: 'inventory',
      columns: [
        { name: 'uid', type: 'string', isIndexed: true },
        { name: 'standard_name', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'last_updated', type: 'number' }, 
      ],
    }),
    tableSchema({
      name: 'quarantine',
      columns: [
        { name: 'raw_text', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'scan_type', type: 'string' }, 
        { name: 'status', type: 'string', isIndexed: true }, 
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'custom_skus',
      columns: [
        { name: 'uid', type: 'string', isIndexed: true },
        { name: 'standard_name', type: 'string' },
      ],
    }),
    // --- THE ENTERPRISE OUTBOX QUEUE ---
    tableSchema({
      name: 'pending_scans',
      columns: [
        { name: 'scan_id', type: 'string', isIndexed: true }, // The Idempotency Key
        { name: 'image_uri', type: 'string' },
        { name: 'scan_type', type: 'string' }, // 'IN' or 'OUT'
        { name: 'shop_id', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true }, // 'pending', 'syncing', 'failed'
        { name: 'retry_count', type: 'number' }, // To prevent infinite loops on broken files
        { name: 'created_at', type: 'number' }, // For strict FIFO ordering
        { name: 'next_retry_at', type: 'number' }, // For exponential backoff retries
      ],
    }),
    // Master catalog — synced from backend on login, survives uninstall
    tableSchema({
      name: 'catalog',
      columns: [
        { name: 'uid', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'aliases', type: 'string' }, // JSON stringified array
      ],
    }),
  ],
});