import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class CatalogItem extends Model {
  static table = 'catalog';

  @field('uid') uid!: string;
  @field('name') name!: string;
  @field('aliases') aliases!: string; // JSON stringified array e.g. '["sugar","khand"]'
}