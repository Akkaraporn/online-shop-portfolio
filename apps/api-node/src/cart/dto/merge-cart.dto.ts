import { IsString, MaxLength } from 'class-validator';

/** Matches `MergeCartRequest` in the contract. */
export class MergeCartDto {
  /**
   * The `X-Cart-Token` the browser held before signing in. An unknown, expired or
   * already-merged value is not an error — the endpoint is idempotent. That includes
   * a value too short to be a token, hence no minimum length.
   */
  @IsString()
  @MaxLength(256)
  cartToken!: string;
}
