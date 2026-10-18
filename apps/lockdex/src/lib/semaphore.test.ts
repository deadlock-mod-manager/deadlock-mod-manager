import { describe, expect, it } from "bun:test";
import { Semaphore } from "./semaphore";

describe("Semaphore", () => {
  it("runs at most `limit` tasks at once, in arrival order", async () => {
    const semaphore = new Semaphore(2);
    const gates = [0, 1, 2].map(() => Promise.withResolvers<void>());
    const started: number[] = [];

    const runs = gates.map((gate, index) =>
      semaphore.run(async () => {
        started.push(index);
        await gate.promise;
        return index;
      }),
    );

    await Bun.sleep(0);
    expect(started).toEqual([0, 1]);

    gates[0].resolve();
    await runs[0];
    await Bun.sleep(0);
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
  });

  it("releases the slot when a task throws", async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await semaphore.run(async () => "next")).toBe("next");
  });
});
