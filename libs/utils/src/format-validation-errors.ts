import type { ValidationError } from 'class-validator';

// Flattens class-validator's nested error tree into one log-friendly line,
// e.g. "items.0.quantity: quantity must not be less than 1".
// Only property paths and messages are included, never the rejected values,
// so payload contents don't leak into logs.
export function formatErrors(
  errors: ValidationError[],
  parentPath = '',
): string {
  return errors
    .flatMap((error) => {
      const path = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;
      const own = Object.values(error.constraints ?? {}).map(
        (message) => `${path}: ${message}`,
      );
      const nested = error.children?.length
        ? [formatErrors(error.children, path)]
        : [];
      return [...own, ...nested];
    })
    .join('; ');
}
