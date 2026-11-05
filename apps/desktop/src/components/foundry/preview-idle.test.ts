import { expect, test } from "bun:test";
import { waitForPreviewIdle } from "./preview-idle";

test("cancelled background parsing does not resume after its task was replaced", async () => {
  const controller = new AbortController();
  const pending = waitForPreviewIdle(controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("a background parse yields before starting and eventually resumes", async () => {
  let ready = false;
  const pending = waitForPreviewIdle(new AbortController().signal).then(() => {
    ready = true;
  });
  expect(ready).toBe(false);
  await pending;
  expect(ready).toBe(true);
});
