import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { mySchema } from './schema';
import Inventory from './Inventory';
import Quarantine from './Quarantine';
import CustomSku from './CustomSku';
import PendingScan from './PendingScan';
import CatalogItem from './CatalogItem';

let database: Database;

try {
  const adapter = new SQLiteAdapter({
    schema: mySchema,
    // No migrations passed — fresh schema defines all tables through version 6.
    // WatermelonDB only needs migrations when upgrading an EXISTING database
    // from an older schema version. On first install the schema is applied directly.
    // Add migrations back here when bumping to version 7+.
    jsi: true,
    onSetUpError: error => {
      console.error('WatermelonDB setup error:', error);
    },
  });

  database = new Database({
    adapter,
    modelClasses: [Inventory, Quarantine, CustomSku, PendingScan, CatalogItem],
  });
} catch (error) {
  console.error('WatermelonDB initialization failed:', error);
  // Create a fallback adapter without JSI so the app doesn't crash
  const fallbackAdapter = new SQLiteAdapter({
    schema: mySchema,
    jsi: false,
    onSetUpError: err => {
      console.error('WatermelonDB fallback also failed:', err);
    },
  });
  database = new Database({
    adapter: fallbackAdapter,
    modelClasses: [Inventory, Quarantine, CustomSku, PendingScan, CatalogItem],
  });
}

export { database };