export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.active--;
      }
    }
  }
}
