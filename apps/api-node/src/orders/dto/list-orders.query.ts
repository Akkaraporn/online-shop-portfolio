import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Omittable } from '../../common/validation/omittable';

export const MAX_ORDER_LIMIT = 50;

/** Query parameters for `GET /orders`. */
export class ListOrdersQuery {
  @Omittable()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  // Explicit conversion: implicit conversion is off globally because it also coerces
  // request bodies. See common/problem/validation.ts.
  @Omittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_LIMIT)
  limit?: number;
}
