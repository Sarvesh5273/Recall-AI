import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class PendingScan extends Model {
  static table = 'pending_scans';

  @field('scan_id') scanId!: string;
  @field('image_uri') imageUri!: string;
  @field('scan_type') scanType!: string;
  @field('shop_id') shopId!: string;
  @field('status') status!: string;
  @field('retry_count') retryCount!: number;
  @date('created_at') createdAt!: Date;
  @field('next_retry_at') nextRetryAt!: number;
}