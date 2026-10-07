export type OperationErrorCode =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

const USER_MESSAGES: Record<OperationErrorCode, string> = {
  AUTH_ERROR: 'Authentication is required. Sign in and try again.',
  VALIDATION_ERROR: 'The request could not be validated. Check your input and try again.',
  RATE_LIMIT: 'The service is receiving too many requests. Wait before trying again.',
  PROVIDER_ERROR: 'The service could not complete your request. Try again later.',
  NETWORK_ERROR: 'A network error interrupted the request. Check your connection and retry.',
  TIMEOUT: 'The operation timed out. It may still be processing; verify its status before retrying.',
  UNKNOWN: 'The operation could not be completed. Try again.',
};

export class OperationError extends Error {
  constructor(
    public readonly code: OperationErrorCode,
    message: string = USER_MESSAGES[code],
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'OperationError';
  }
}

export const normalizeError = (error: unknown, status?: number): OperationError => {
  if (error instanceof OperationError) return error;

  const detail = error instanceof Error ? error.message : '';
  let code: OperationErrorCode;

  if (status === 401 || status === 403 || /sign in|unauthori[sz]ed|authentication/i.test(detail)) {
    code = 'AUTH_ERROR';
  } else if (status === 400 || status === 413 || status === 422) {
    code = 'VALIDATION_ERROR';
  } else if (status === 429) {
    code = 'RATE_LIMIT';
  } else if (status === 408 || status === 504 || /timed? ?out|timeout/i.test(detail)) {
    code = 'TIMEOUT';
  } else if (status !== undefined && status >= 500) {
    code = 'PROVIDER_ERROR';
  } else if (error instanceof TypeError || /network|failed to fetch/i.test(detail)) {
    code = 'NETWORK_ERROR';
  } else {
    code = 'UNKNOWN';
  }

  return new OperationError(code, USER_MESSAGES[code], error);
}
