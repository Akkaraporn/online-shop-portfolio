import { IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * The contract's email pattern, verbatim. Not `@IsEmail()`: class-validator and
 * Hibernate Validator disagree about the edges (a 64-character domain label, say),
 * and an address one backend registers and the other refuses is a parity failure.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches `RegisterRequest` in the contract. */
export class RegisterDto {
  @IsString()
  @Matches(EMAIL_PATTERN, { message: 'must be a valid email address' })
  @MaxLength(255)
  email!: string;

  // 10 is the contract's minimum. Length rather than strength rules on purpose:
  // composition requirements push people towards predictable substitutions, and
  // argon2 with these parameters is what actually makes a guess expensive.
  @IsString()
  @Length(10, 128, { message: 'must be between 10 and 128 characters' })
  password!: string;

  @IsString()
  @Length(1, 120)
  fullName!: string;
}
