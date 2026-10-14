import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly suggestion?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function redact(value: string): string {
  let result = value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  const key = process.env.OPENAI_API_KEY;
  if (key) result = result.split(key).join('[REDACTED]');
  return result;
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === 'TimeoutError')
    return new AppError(
      'OPERATION_TIMEOUT',
      'The operation exceeded its configured deadline.',
      'Inspect persisted jobs before retrying a paid request.',
    );
  if (error instanceof ZodError)
    return new AppError(
      'VALIDATION_ERROR',
      'Invalid arguments or file contents.',
      'Check the schema and command help.',
      error.issues,
    );
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined;
  if (status === 401)
    return new AppError(
      'AUTHENTICATION_FAILED',
      'OpenAI rejected authentication.',
      'Set a valid OPENAI_API_KEY in the environment.',
    );
  if (status === 403)
    return new AppError(
      'ACCESS_DENIED',
      'Your account cannot access this operation.',
      'Check organization verification, permissions and model access.',
    );
  if (status === 429)
    return new AppError(
      'RATE_LIMIT',
      'OpenAI rate limit or quota exceeded.',
      'Check quota; retry status reads later. Creation is not automatically repeated.',
    );
  return new AppError(
    'OPERATION_FAILED',
    redact(error instanceof Error ? error.message : String(error)),
    'Use doctor or command --help for diagnostics.',
  );
}

export function errorData(error: unknown) {
  const e = normalizeError(error);
  return { code: e.code, message: redact(e.message), suggestion: e.suggestion, details: e.details };
}
