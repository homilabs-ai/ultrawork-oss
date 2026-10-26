const PERMANENT = /prompt is too long|context[ _-]?length|maximum context|too many tokens|max_tokens|invalid[_ ]request|api key|unauthorized|forbidden|permission|credit balance|billing|not found/i;

const TRANSIENT =
  /timed out|timeout|overloaded|rate.?limit|too many requests|econnreset|epipe|etimedout|enotfound|socket|fetch failed|network|internal server error|service unavailable|bad gateway|temporarily/i;

export function isTransientLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const api = error as Error & { statusCode?: number; isRetryable?: boolean };
  const text = `${error.name}: ${error.message}`;

  if (PERMANENT.test(text)) return false;
  if (typeof api.statusCode === "number") {
    return api.statusCode === 408 || api.statusCode === 429 || api.statusCode >= 500;
  }
  if (typeof api.isRetryable === "boolean") return api.isRetryable;
  if (error.name === "TimeoutError") return true;
  if (TRANSIENT.test(text)) return true;

  if (error.name === "AI_APICallError") return true;

  return error.cause instanceof Error ? isTransientLlmError(error.cause) : false;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 4000),
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack?.slice(0, 2000) }
          : error.cause,
    };
  }
  return { message: String(error) };
}
