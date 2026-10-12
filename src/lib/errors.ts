export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_STATE'
  | 'VALIDATION'
  | 'PROVIDER_ERROR'
  | 'INTERNAL';

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  QUOTA_EXCEEDED: 409,
  INVALID_STATE: 409,
  VALIDATION: 422,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(public code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
  get status() {
    return STATUS[this.code];
  }
}

/** Map a Postgres/PostgREST error raised by our RPCs to an AppError. */
export function fromDbError(err: { message?: string; code?: string } | null | undefined): AppError {
  const msg = err?.message ?? 'Database error';
  const prefixes: [string, AppErrorCode][] = [
    ['QUOTA_EXCEEDED', 'QUOTA_EXCEEDED'],
    ['INVALID_STATE', 'INVALID_STATE'],
    ['VALIDATION', 'VALIDATION'],
    ['FORBIDDEN', 'FORBIDDEN'],
    ['BUSINESS_NOT_FOUND', 'NOT_FOUND'],
    ['CONTENT_NOT_FOUND', 'NOT_FOUND'],
  ];
  for (const [prefix, code] of prefixes) {
    if (msg.startsWith(prefix)) {
      const clean = msg.slice(prefix.length).replace(/^:\s*/, '') || prefix;
      return new AppError(code, clean);
    }
  }
  if (err?.code === '42501') return new AppError('FORBIDDEN', 'Not allowed');
  return new AppError('INTERNAL', msg);
}

export function toMessage(err: unknown): { error: string; code: AppErrorCode } {
  if (err instanceof AppError) return { error: err.message, code: err.code };
  console.error(err);
  return { error: 'Something went wrong. Please try again.', code: 'INTERNAL' };
}
