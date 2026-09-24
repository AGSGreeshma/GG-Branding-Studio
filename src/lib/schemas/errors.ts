import { z } from "zod";

/** Error codes and HTTP statuses (plan §18.5). */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCK_VIOLATION: 409,
  RATE_LIMITED: 429,
  AI_OUTPUT_INVALID: 502,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** User-safe default messages. Internal details never reach the client. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some of the information sent was not valid. Please check it and try again.",
  UNAUTHORIZED: "Your session could not be verified. Refresh the page to continue.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "We could not find that.",
  CONFLICT: "This project changed somewhere else. Refresh to see the latest version.",
  LOCK_VIOLATION: "That decision is locked. Unlock it first if you want to change it.",
  RATE_LIMITED: "Too many requests right now. Please wait a moment and try again.",
  AI_OUTPUT_INVALID: "We couldn't complete this AI step. Your previous work is safe.",
  AI_PROVIDER_UNAVAILABLE:
    "The AI service is unavailable right now. Your previous work is safe. Please try again shortly.",
  AI_TIMEOUT: "The AI step took too long. Your previous work is safe. Please try again.",
  INTERNAL: "Something went wrong on our side. Your work is safe. Please try again.",
};

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  VALIDATION_ERROR: false,
  UNAUTHORIZED: false,
  FORBIDDEN: false,
  NOT_FOUND: false,
  CONFLICT: false,
  LOCK_VIOLATION: false,
  RATE_LIMITED: true,
  AI_OUTPUT_INVALID: true,
  AI_PROVIDER_UNAVAILABLE: true,
  AI_TIMEOUT: true,
  INTERNAL: true,
};

export interface AppErrorOptions {
  /** Internal detail for logs only. Never sent to the client. */
  message?: string;
  /** Deliberately user-facing text that replaces the default message for this code. */
  publicMessage?: string;
  retryable?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly publicMessage: string;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
    this.publicMessage = options.publicMessage ?? DEFAULT_MESSAGE[code];
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    request_id: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/**
 * Converts any thrown value into the plan §18.5 error shape.
 * Only AppError.publicMessage or a default message is ever returned; raw
 * error messages, stacks and causes stay server-side.
 */
export function toErrorResponse(
  err: unknown,
  requestId: string,
): { status: number; body: ErrorBody } {
  let appError: AppError;
  if (isAppError(err)) {
    appError = err;
  } else if (err instanceof z.ZodError) {
    appError = new AppError("VALIDATION_ERROR", { cause: err });
  } else {
    appError = new AppError("INTERNAL", { cause: err });
  }

  return {
    status: appError.status,
    body: {
      error: {
        code: appError.code,
        message: appError.publicMessage,
        retryable: appError.retryable,
        request_id: requestId,
      },
    },
  };
}
