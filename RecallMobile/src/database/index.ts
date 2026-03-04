import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { mySchema } from './schema';
import Inventory from './Inventory';
import Quarantine from './Quarantine';
import CustomSku from './CustomSku';
import PendingScan from './PendingScan'; // <--- 1. IMPORT THIS

const adapter = new SQLiteAdapter({
  schema: mySchema,
  jsi: true, // Enables the high-speed native C++ bridge
  onSetUpError: error => {
    console.error("WatermelonDB failed to initialize:", error);
  }
});

export const database = new Database({
  adapter,
  modelClasses: [Inventory, Quarantine, CustomSku, PendingScan], // <--- 2. ADD IT HERE
});