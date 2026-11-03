import { expect, test } from "bun:test";
import { PreviewWorkQueue } from "./preview-work-queue";

test("preview work is serial and foreground requests go before queued thumbnails", async () => {
  const queue = new PreviewWorkQueue();
  const gate = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = queue.run(() => gate.promise, new AbortController().signal);
  const card = queue.run(async () => {
    order.push("card");
  }, new AbortController().signal);
  const detail = queue.run(
    async () => {
      order.push("detail");
    },
    new AbortController().signal,
    1,
  );
  expect(order).toEqual([]);
  gate.resolve();
  await Promise.all([first, card, detail]);
  expect(order).toEqual(["detail", "card"]);
});

test("an offscreen queued card is cancelled without ever decoding", async () => {
  const queue = new PreviewWorkQueue();
  const gate = Promise.withResolvers<void>();
  const first = queue.run(() => gate.promise, new AbortController().signal);
  const controller = new AbortController();
  let started = false;
  const cancelled = queue.run(async () => {
    started = true;
  }, controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  gate.resolve();
  await first;
  expect(started).toBe(false);
});

test("a failed capture releases the queue for the next card", async () => {
  const queue = new PreviewWorkQueue();
  const first = queue.run(async () => {
    throw new Error("lost GPU context");
  }, new AbortController().signal);
  const next = queue.run(
    async () => "next image",
    new AbortController().signal,
  );
  await expect(first).rejects.toThrow("lost GPU context");
  expect(await next).toBe("next image");
});
