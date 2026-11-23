import { logger } from 'firebase-functions';

/**
 * Records an unexpected error before a callable replaces it with a generic "unavailable"
 * reply, so the real cause (for example a missing Firestore index) shows in the logs.
 * Only the error's type, code and message are logged, never request data.
 */
export function logUnexpected(where: string, error: unknown): void {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          code: (error as { code?: unknown }).code,
          message: error.message,
          stack: error.stack,
        }
      : { value: String(error) };
  logger.error(`${where} failed unexpectedly`, details);
}
