import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';

import { Omittable } from '../../common/validation/omittable';
import { MAX_ORDER_LIMIT } from '../../orders/dto/list-orders.query';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'fulfilled',
  'completed',
  'cancelled',
  'expired',
  'payment_failed',
] as const;

/** Matches `CreateVariantRequest`. */
export class CreateVariantDto {
  @IsString()
  @Length(1, 64)
  sku!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  // Satang. An integer, never a decimal string: rule 1.
  @IsInt()
  @Min(0)
  @Max(100_000_000_00)
  priceCents!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockOnHand!: number;
}

/** Matches `CreateProductRequest`. */
export class CreateProductDto {
  @IsString()
  @MaxLength(160)
  @Matches(SLUG, { message: 'must be a lowercase hyphenated slug' })
  slug!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @MaxLength(10_000)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @Omittable()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];

  @Omittable()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_protocol: true }, { each: true })
  imageUrls?: string[];
}

/** Matches `UpdateProductRequest`. Variants are not touched here. */
export class UpdateProductDto {
  @Omittable()
  @IsString()
  @MaxLength(160)
  @Matches(SLUG, { message: 'must be a lowercase hyphenated slug' })
  slug?: string;

  @Omittable()
  @IsString()
  @Length(1, 200)
  name?: string;

  @Omittable()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @Omittable()
  @IsUUID()
  categoryId?: string;

  @Omittable()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];
}

/** Matches `StockAdjustmentRequest`. A signed delta — never an absolute value. */
export class StockAdjustmentDto {
  @IsInt()
  @NotEquals(0, { message: 'must not be zero' })
  @Min(-1_000_000)
  @Max(1_000_000)
  delta!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}

/** Matches `UpdateOrderStatusRequest`. */
export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];
}

export class ProductIdParam {
  @IsUUID()
  productId!: string;
}

export class VariantIdParam {
  @IsUUID()
  variantId!: string;
}

/** Query parameters for `GET /admin/products`. */
export class ListAdminProductsQuery {
  @Omittable()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

  @Omittable()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  @Omittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_LIMIT)
  limit?: number;
}

/** Query parameters for `GET /admin/orders`. */
export class ListAdminOrdersQuery {
  @Omittable()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @Omittable()
  @IsUUID()
  userId?: string;

  @Omittable()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  @Omittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ORDER_LIMIT)
  limit?: number;
}
