import { isAxiosError } from 'axios';
import {
  BrokenCircuitError,
  CircuitState,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TaskCancelledError,
  circuitBreaker,
  handleAll,
  handleWhen,
  type Event,
  type IFailureEvent,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';

// A 4xx means the server rejected this specific request and will reject it
// again on retry, so it must not be retried or count against a breaker.
// Network errors, timeouts, and 5xx are all genuinely worth retrying.
export function isRetryableHttpError(error: unknown): boolean {
  if (isAxiosError(error) && error.response) {
    return error.response.status >= 500;
  }
  return true;
}

export type FailureKind = 'timeout' | 'network' | 'app' | 'client';

export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof TaskCancelledError) return 'timeout';
  if (isAxiosError(error)) {
    if (!error.response) return 'network';
    if (error.response.status < 500) return 'client';
  }
  return 'app';
}

export type BreakerState = 'closed' | 'half-open' | 'open' | 'isolated';

const BREAKER_STATES: Record<CircuitState, BreakerState> = {
  [CircuitState.Closed]: 'closed',
  [CircuitState.HalfOpen]: 'half-open',
  [CircuitState.Open]: 'open',
  [CircuitState.Isolated]: 'isolated',
};

// Observation points, so callers can record metrics without this library
// depending on any metrics code.
export interface RetryHooks {
  /** Called each time a failed attempt is about to be retried. */
  onRetry?: () => void;
  /** Called when the last attempt failed and no retries are left. */
  onGiveUp?: () => void;
  /** Called for every failed attempt, including unhandled ones such as 4xx, classified by cause. */
  onFailure?: (kind: FailureKind) => void;
}

export interface BreakerHooks extends RetryHooks {
  /** Called with the initial state on creation and on every state change. */
  onBreakerStateChange?: (state: BreakerState) => void;
  /** Called when a call is rejected because the breaker is open, without reaching the dependency. */
  onReject?: () => void;
}

function reportFailures(
  policy: { onFailure: Event<IFailureEvent> },
  onFailure: (kind: FailureKind) => void,
) {
  policy.onFailure(({ reason }) => {
    if ('error' in reason) onFailure(classifyFailure(reason.error));
  });
}

export interface RetryTimeoutPolicyOptions extends RetryHooks {
  timeoutMs?: number;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that should never be retried (e.g. a 4xx that will fail again). Defaults to retrying everything. */
  isRetryable?: (error: unknown) => boolean;
}

export function createRetryTimeoutPolicy(
  options: RetryTimeoutPolicyOptions = {},
) {
  const {
    timeoutMs = 2000,
    maxAttempts = 3,
    initialDelayMs = 128,
    maxDelayMs = 30_000,
    isRetryable,
    onRetry,
    onGiveUp,
    onFailure,
  } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(errorFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff({
      initialDelay: initialDelayMs,
      maxDelay: maxDelayMs,
    }),
  });
  if (onRetry) retryPolicy.onRetry(() => onRetry());
  if (onGiveUp) retryPolicy.onGiveUp(() => onGiveUp());
  if (onFailure) reportFailures(retryPolicy, onFailure);

  return wrap(retryPolicy, timeoutPolicy);
}

export interface RetryTimeoutBreakerPolicyOptions
  extends RetryTimeoutPolicyOptions, BreakerHooks {
  consecutiveFailuresToOpen?: number;
  halfOpenAfterMs?: number;
}

export function createRetryTimeoutBreakerPolicy(
  options: RetryTimeoutBreakerPolicyOptions = {},
) {
  const {
    timeoutMs = 2000,
    maxAttempts = 3,
    initialDelayMs = 128,
    maxDelayMs = 30_000,
    consecutiveFailuresToOpen = 3,
    halfOpenAfterMs = 30_000,
    isRetryable,
    onRetry,
    onGiveUp,
    onFailure,
    onBreakerStateChange,
    onReject,
  } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;
  // An open breaker rejects instantly; retrying that would only sleep through
  // the backoff schedule against a breaker that can't close yet.
  const retryFilter = handleWhen(
    (error) =>
      !(error instanceof BrokenCircuitError) && (isRetryable?.(error) ?? true),
  );

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(retryFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff({
      initialDelay: initialDelayMs,
      maxDelay: maxDelayMs,
    }),
  });
  const breakerPolicy = circuitBreaker(errorFilter, {
    halfOpenAfter: halfOpenAfterMs,
    breaker: new ConsecutiveBreaker(consecutiveFailuresToOpen),
  });
  if (onRetry) retryPolicy.onRetry(() => onRetry());
  if (onGiveUp) retryPolicy.onGiveUp(() => onGiveUp());
  // Reported from the breaker, not the retry policy: it sits inside the retry
  // loop, so it sees each attempt once and never sees rejected calls.
  if (onFailure) reportFailures(breakerPolicy, onFailure);
  if (onBreakerStateChange) {
    onBreakerStateChange(BREAKER_STATES[breakerPolicy.state]);
    breakerPolicy.onStateChange((state) =>
      onBreakerStateChange(BREAKER_STATES[state]),
    );
  }

  // retry (outer) -> circuit breaker -> timeout (inner), per attempt.
  const policy = wrap(retryPolicy, breakerPolicy, timeoutPolicy);

  // cockatiel has no "call rejected" event, and the retry filter above lets
  // BrokenCircuitError pass straight through, so it can only be seen here.
  const execute: typeof policy.execute = async (fn) => {
    try {
      return await policy.execute(fn);
    } catch (e) {
      if (e instanceof BrokenCircuitError) {
        onReject?.();
      }
      throw e;
    }
  };
  return { execute };
}
