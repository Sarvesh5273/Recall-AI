import { Model } from '@nozbe/watermelondb';
import { text, date, readonly, field } from '@nozbe/watermelondb/decorators';

export default class Quarantine extends Model {
  static table = 'quarantine';

  @text('raw_text') rawText!: string;
  @field('quantity') quantity!: number; // <--- ADDED
  @text('unit') unit!: string;          // <--- ADDED
  @text('scan_type') scanType!: string;
  @text('status') status!: string;
  @readonly @date('created_at') createdAt!: Date;
}