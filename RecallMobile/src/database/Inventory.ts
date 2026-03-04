import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Inventory extends Model {
  static table = 'inventory';

  @text('uid') uid!: string;
  @text('standard_name') standardName!: string;
  @field('quantity') quantity!: number;
  @text('unit') unit!: string;
  @readonly @date('last_updated') lastUpdated!: Date;
}