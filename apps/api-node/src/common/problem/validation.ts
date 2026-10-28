import {
  ArgumentMetadata,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { FieldError, ProblemException, Problems } from './problem.exception';

const OPTIONAL_BODY = Symbol('optional-body');

/**
 * Marks a body DTO whose request body the contract declares `required: false`, so
 * the request may be sent with no body at all. Every other body is required.
 */
export function OptionalBody(): ClassDecorator {
  return (target) => Reflect.defineMetadata(OPTIONAL_BODY, true, target);
}

/**
 * The global validation pipe.
 *
 * Two settings here are contract requirements rather than preferences:
 *
 * - `whitelist: true` with `forbidNonWhitelisted: false`. The contract says
 *   unrecognised query parameters are *ignored*, not rejected, so unknown
 *   properties are stripped and the request proceeds. Turning on
 *   `forbidNonWhitelisted` would return 400 for a stray `?utm_source=`, which
 *   would break the API for anyone arriving from a link with tracking on it.
 *
 * - 422, not 400. The contract reserves 422 for a well-formed request whose
 *   contents are invalid, and every such response carries `errors[]`.
 *
 * Every failing field is reported, not the first: a client fixing a form one
 * field per round trip is the behaviour this avoids.
 */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  // Deliberately NOT enableImplicitConversion, even though it makes query DTOs
  // more convenient. It coerces request *bodies* too, so a JSON number sent for
  // a string field becomes a string and passes `@IsString()`. Jackson on the
  // Java side is strict by default and would reject the same body with a 422 —
  // a parity failure produced entirely by a convenience setting.
  //
  // The cost is that query and path DTOs must declare `@Type(() => Number)`
  // explicitly, since those values genuinely do arrive as strings.
  stopAtFirstError: false,
  exceptionFactory: (errors) =>
    Problems.validationFailed(
      flattenValidationErrors(errors as ValidationError[]),
      'One or more fields are invalid.',
    ),
};

/**
 * The global pipe, plus three rules the contract needs and class-validator lacks.
 * Each was found by Schemathesis, and each is what Spring does or must be told to do:
 *
 * - **A missing required body is a 400.** Nest turns it into `{}` before validating,
 *   so a PATCH whose fields are all optional succeeded with no body at all. Spring
 *   answers 400 by default.
 * - **A body that is not a JSON object is a 400.** An array passed straight through:
 *   class-validator finds nothing to check on one. Jackson cannot bind it either.
 * - **No string may contain U+0000.** PostgreSQL text cannot store it, so a NUL in
 *   any field reached the database and came back as a 500. It is a 422 on that field
 *   instead, checked here once rather than on every string property.
 */
class ContractValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const isDtoBody =
      metadata.type === 'body' &&
      typeof metadata.metatype === 'function' &&
      metadata.metatype !== Object;

    if (isDtoBody && (value === undefined || value === null)) {
      if (!Reflect.getMetadata(OPTIONAL_BODY, metadata.metatype!)) {
        throw new ProblemException('bad-request', { detail: 'A request body is required.' });
      }
    } else if (isDtoBody && (typeof value !== 'object' || Array.isArray(value))) {
      throw new ProblemException('bad-request', {
        detail: 'The request body must be a JSON object.',
      });
    }

    const transformed: unknown = await super.transform(value, metadata);

    // Scanned after the whitelist has stripped unknown properties: those are ignored
    // (rule 6), whatever they hold. An undeclared `@Body() body: unknown` is never
    // scanned — its handler validates it itself, as the webhook does.
    if (metadata.metatype !== Object) {
      const nulBytes = findNulBytes(transformed);
      if (nulBytes.length > 0) {
        throw Problems.validationFailed(
          nulBytes.map((field) => ({ field, message: 'must not contain a NUL character' })),
          'One or more fields are invalid.',
        );
      }
    }

    return transformed;
  }
}

/** Paths, in `errors[]` notation, of every string under `value` holding U+0000. */
function findNulBytes(value: unknown, path = ''): string[] {
  if (typeof value === 'string') {
    return value.includes('\u0000') ? [path || 'value'] : [];
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [
    // A key holding a NUL is reported against its parent: there is no field to name.
    ...(key.includes('\u0000') ? [path || 'value'] : []),
    ...findNulBytes(child, joinPath(path, key)),
  ]);
}

export function createValidationPipe(): ValidationPipe {
  return new ContractValidationPipe(validationPipeOptions);
}

/**
 * Flattens class-validator's tree into the contract's flat `errors[]`.
 *
 * Paths are built the way the contract's examples write them — `items[0].quantity`
 * — so a client can map an error straight onto a form field. class-validator
 * represents array indices as child properties named "0", "1", which is why the
 * numeric case is bracketed rather than dotted.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const flattened: FieldError[] = [];

  for (const error of errors) {
    const path = joinPath(parentPath, error.property);

    for (const message of Object.values(error.constraints ?? {})) {
      flattened.push({ field: path, message });
    }

    if (error.children && error.children.length > 0) {
      flattened.push(...flattenValidationErrors(error.children, path));
    }
  }

  return flattened;
}

function joinPath(parent: string, property: string): string {
  if (!parent) {
    return property;
  }
  return /^\d+$/.test(property) ? `${parent}[${property}]` : `${parent}.${property}`;
}
