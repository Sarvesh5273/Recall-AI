import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class CustomSku extends Model {
  static table = 'custom_skus';

  @field('uid') uid!: string;
  @field('standard_name') standard_name!: string;
}