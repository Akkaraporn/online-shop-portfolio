import { IsString, MaxLength } from 'class-validator';
import { OptionalBody } from '../../common/problem/validation';
import { Omittable } from '../../common/validation/omittable';

/** Matches `RefreshRequest` in the contract. */
export class RefreshDto {
  // Only an upper bound. A string too short to be a token is simply not a token we
  // issued, so it is a 401 like any other unknown token — a minimum length would
  // turn it into a 422 the contract cannot express (Schemathesis found exactly that).
  @IsString()
  @MaxLength(256)
  refreshToken!: string;
}

/**
 * Matches `LogoutRequest`. The body is optional, and so is its one field.
 *
 * With a token, the family it belongs to is revoked. Without one but with a bearer,
 * every family for that user is. With neither, the response is still 204.
 */
@OptionalBody()
export class LogoutDto {
  @Omittable()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}
