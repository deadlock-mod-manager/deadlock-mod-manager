import { Hono } from "hono";

const healthRouter = new Hono();

let isReady = false;

export function setHealthReady(ready: boolean) {
  isReady = ready;
}

healthRouter.get("/health", (c) => {
  if (isReady) {
    return c.text("OK", 200);
  }
  return c.text("Starting", 503);
});

export default healthRouter;
