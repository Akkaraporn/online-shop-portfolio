import { ValidateIf } from 'class-validator';

/**
 * An optional field may be left out; it may not be sent as `null`.
 *
 * class-validator's `@IsOptional()` skips validation for `null` as well as for
 * `undefined`, so `{"imageUrls": null}` was accepted for a field the contract does
 * not declare nullable (cross-implementation rule 7). Jackson binds that null and a
 * Java DTO would have to decide separately what it means — one more place to drift.
 * Only an absent field skips the remaining rules here; a `null` fails them.
 */
export function Omittable(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}
