#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const [portText, scriptPath] = process.argv.slice(2);
const port = Number(portText);
const resultKey = "__DMM_ISSUE_643_RESULT__";
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!Number.isInteger(port) || !scriptPath || typeof WebSocket !== "function") {
  throw new Error(
    "Usage: node webkit-evaluate.mjs PORT SCRIPT_PATH (Node 22+)",
  );
}

async function findSocketUrl() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const html = await response.text();
      const path = html.match(/\/socket\/[^'"?]+\/WebPage/)?.[0];
      if (path) {
        return `ws://127.0.0.1:${port}${path}`;
      }
    } catch {
      // The app is still starting.
    }
    await sleep(100);
  }
  throw new Error("WebKit inspector did not become ready");
}

class Remote {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.targetId = undefined;
    this.outerId = 0;
    this.innerId = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Inspector connection timed out")),
        10_000,
      );
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (
          message.method === "Target.targetCreated" &&
          message.params.targetInfo.type === "page"
        ) {
          this.targetId = message.params.targetInfo.targetId;
          clearTimeout(timeout);
          resolve();
          return;
        }
        if (message.method !== "Target.dispatchMessageFromTarget") {
          return;
        }
        const inner = JSON.parse(message.params.message);
        const pending = this.pending.get(inner.id);
        if (!pending) {
          return;
        }
        this.pending.delete(inner.id);
        if (inner.error) {
          pending.reject(new Error(inner.error.message));
        } else {
          pending.resolve(inner.result);
        }
      });
      this.socket.addEventListener("error", () =>
        reject(new Error("Inspector connection failed")),
      );
    });
  }

  async evaluate(expression) {
    const id = ++this.innerId;
    const response = new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
    this.socket.send(
      JSON.stringify({
        id: ++this.outerId,
        method: "Target.sendMessageToTarget",
        params: {
          targetId: this.targetId,
          message: JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: { expression, returnByValue: true },
          }),
        },
      }),
    );
    const result = await response;
    if (result.wasThrown) {
      throw new Error(result.result.description ?? "Evaluation failed");
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

const remote = new Remote(await findSocketUrl());
try {
  await remote.connect();
  const script = await readFile(scriptPath, "utf8");
  await remote.evaluate(script);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await remote.evaluate(`globalThis.${resultKey}`);
    if (result) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.error ? 1 : 0;
      break;
    }
    await sleep(100);
  }
  if (
    !process.exitCode &&
    !(await remote.evaluate(`Boolean(globalThis.${resultKey})`))
  ) {
    throw new Error("IPC probe did not finish within 180 seconds");
  }
} finally {
  remote.close();
}
