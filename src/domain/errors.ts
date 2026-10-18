export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type FieldErrors = Record<string, string[]>;

/** An expected failure whose code and message are safe to show to the client. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const NOT_FOUND_MESSAGE = "You can’t open this work order with your current access.";
