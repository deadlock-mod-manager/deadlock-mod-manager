const STEP = 1 / 60;

export class PreviewClock {
  time = 0;
  private accumulator = 0;
  private target: number | null = null;
  private needsReset = false;

  constructor(
    private readonly reset: () => void,
    private readonly step: (delta: number) => void,
  ) {}

  seek(time: number) {
    this.target = Math.max(0, Number.isFinite(time) ? time : 0);
    this.needsReset = true;
  }

  get seeking() {
    return this.target !== null;
  }

  tick(delta: number, playing: boolean, speed: number) {
    if (this.needsReset) {
      this.time = 0;
      this.accumulator = 0;
      this.reset();
      this.needsReset = false;
    }
    if (this.target !== null) {
      const deadline = performance.now() + 4;
      for (let count = 0; count < 120 && this.time < this.target; count += 1) {
        const delta = Math.min(STEP, this.target - this.time);
        this.step(delta);
        this.time += delta;
        if (performance.now() >= deadline) break;
      }
      if (this.time >= this.target) this.target = null;
      return;
    }
    if (!playing) return;
    this.accumulator = Math.min(
      this.accumulator + Math.max(0, delta) * speed,
      STEP * 4,
    );
    while (this.accumulator + 1e-9 >= STEP) {
      this.step(STEP);
      this.time += STEP;
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }
  }
}
