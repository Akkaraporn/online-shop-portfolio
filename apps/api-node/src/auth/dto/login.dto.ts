import { IsString, Matches, MaxLength } from 'class-validator';

import { EMAIL_PATTERN } from './register.dto';

/**
 * Matches `LoginRequest` in the contract.
 *
 * No length or format rules on the password beyond being a string: rejecting a
 * too-short password at login would tell a caller their guess was not even
 * plausible, which is one more bit than they should get. Every wrong credential
 * gets the same 401.
 */
export class LoginDto {
  @IsString()
  @Matches(EMAIL_PATTERN, { message: 'must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(1024)
  password!: string;
}
