const POSTGRES_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { driverError?: { code?: string } }).driverError?.code ===
      POSTGRES_UNIQUE_VIOLATION
  );
}
