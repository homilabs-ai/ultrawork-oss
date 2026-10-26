import type { ErrorProcessor } from "@mastra/core/processors";
import { StreamErrorRetryProcessor } from "@mastra/core/processors";
import type { HarnessConfig } from "@/core/config.ts";
import { isTransientLlmError } from "@/core/errors.ts";

export type RetryNotice = (error: unknown, info: { attempt: number; maxAttempts: number; retryInMs: number }) => void;

export function llmRetryProcessor(config: HarnessConfig, onRetry: RetryNotice): ErrorProcessor {
  const { llmMaxAttempts, llmRetryBaseDelayMs, llmRetryMaxDelayMs } = config;

  return new StreamErrorRetryProcessor({
    maxRetries: Math.max(0, llmMaxAttempts - 1),

    delayMs: ({ retryCount }) => {
      const raw = llmRetryBaseDelayMs * 2 ** retryCount;
      return Math.round(Math.min(llmRetryMaxDelayMs, raw) * (0.5 + Math.random() / 2));
    },

    matchers: [
      {
        match: isTransientLlmError,
        onRetry: ({ error, retryCount, delayMs }) =>
          onRetry(error, {
            attempt: retryCount + 1,
            maxAttempts: llmMaxAttempts,
            retryInMs: delayMs,
          }),
      },
    ],
  });
}
