import { log } from "./logger.js";

export interface BootSchedulerSnapshot {
  limit: number;
  active: number;
  queued: number;
  completed: number;
  timedOut: number;
}

interface Waiter<T> {
  name: string;
  queuedAt: number;
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  timer?: NodeJS.Timeout;
}

/** Bounds expensive VM boots without limiting cheap container creates. */
export class BootScheduler {
  private active = 0;
  private completed = 0;
  private timedOut = 0;
  private readonly queue: Array<Waiter<unknown>> = [];

  constructor(
    private readonly limit: number,
    private readonly timeoutMs: number,
  ) {}

  run<T>(name: string, run: () => Promise<T>, onQueued?: () => void): Promise<T> {
    if (this.limit <= 0 || this.active < this.limit) {
      this.active++;
      return this.execute(name, run);
    }

    onQueued?.();
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter<T> = { name, queuedAt: Date.now(), run, resolve, reject };
      if (this.timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.queue.indexOf(waiter as Waiter<unknown>);
          if (index < 0) return;
          this.queue.splice(index, 1);
          this.timedOut++;
          reject(new BootQueueTimeoutError(this.timeoutMs));
          log.warn("microVM boot queue timeout", { name, timeoutMs: this.timeoutMs });
        }, this.timeoutMs);
        waiter.timer.unref?.();
      }
      this.queue.push(waiter as Waiter<unknown>);
    });
  }

  snapshot(): BootSchedulerSnapshot {
    return {
      limit: this.limit,
      active: this.active,
      queued: this.queue.length,
      completed: this.completed,
      timedOut: this.timedOut,
    };
  }

  private async execute<T>(name: string, run: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await run();
    } finally {
      this.active--;
      this.completed++;
      log.debug("microVM boot slot released", {
        name,
        durationMs: Date.now() - startedAt,
        ...this.snapshot(),
      });
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const waiter = this.queue.shift()!;
      if (waiter.timer) clearTimeout(waiter.timer);
      this.active++;
      const waitMs = Date.now() - waiter.queuedAt;
      log.debug("microVM boot dequeued", { name: waiter.name, waitMs, ...this.snapshot() });
      this.execute(waiter.name, waiter.run).then(waiter.resolve, waiter.reject);
    }
  }
}

export class BootQueueTimeoutError extends Error {
  readonly code = "BOOT_QUEUE_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`microVM boot queue timed out after ${timeoutMs}ms`);
    this.name = "BootQueueTimeoutError";
  }
}
