import { IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { OptionalBody } from '../../common/problem/validation';
import { Omittable } from '../../common/validation/omittable';

/** Matches `ConfirmPaymentRequest`. The mock provider reads only `cardNumber`. */
@OptionalBody()
export class ConfirmPaymentDto {
  /**
   * Test card. `4242424242424242` succeeds, `4000000000000002` fails. Never stored —
   * it is read to decide the mock outcome and then discarded.
   */
  @Omittable()
  @IsString()
  @Matches(/^[0-9]{12,19}$/, { message: 'must be 12 to 19 digits' })
  cardNumber?: string;

  @Omittable()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  returnUrl?: string;
}
