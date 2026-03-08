import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // All tables up to version 6 are defined in schema.ts (fresh install).
    // Only add migrations here for version 7+. Example:
    // {
    //   toVersion: 7,
    //   steps: [
    //     addColumns({
    //       table: 'inventory',
    //       columns: [{ name: 'category', type: 'string', isOptional: true }],
    //     }),
    //   ],
    // },
  ],
});
