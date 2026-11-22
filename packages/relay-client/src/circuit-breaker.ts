// Per-relay circuit breaker: trips after N consecutive failures, cools down, then probes.
export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

interface RelayState {
  failures: number;
  openedAt: number | null;
}

export class CircuitBreaker {
  private readonly states = new Map<string, RelayState>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  canRequest(key: string): boolean {
    const state = this.states.get(key);
    if (!state || state.openedAt === null) {
      return true;
    }

    if (Date.now() - state.openedAt >= this.options.cooldownMs) {
      // Allow a single probe; we'll reset on success.
      state.openedAt = null;
      state.failures = this.options.failureThreshold - 1;
      return true;
    }

    return false;
  }

  recordSuccess(key: string): void {
    this.states.set(key, { failures: 0, openedAt: null });
  }

  recordFailure(key: string): void {
    const state = this.states.get(key) ?? { failures: 0, openedAt: null };
    state.failures += 1;
    if (state.failures >= this.options.failureThreshold) {
      state.openedAt = Date.now();
    }
    this.states.set(key, state);
  }

  getState(key: string): CircuitState {
    const state = this.states.get(key);
    if (!state || state.openedAt === null) {
      return state && state.failures > 0 ? "half-open" : "closed";
    }
    if (Date.now() - state.openedAt >= this.options.cooldownMs) {
      return "half-open";
    }
    return "open";
  }

  getFailureCount(key: string): number {
    return this.states.get(key)?.failures ?? 0;
  }
}
