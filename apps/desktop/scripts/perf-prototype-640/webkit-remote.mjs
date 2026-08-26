#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const RESULT_KEY = "__DMM_ISSUE_640_RESULT__";
const POLL_INTERVAL_MS = 250;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (typeof WebSocket !== "function") {
  fail("This harness requires a Node.js runtime with the WebSocket API");
}

function parseArguments(argv) {
  const [action, ...rest] = argv;
  const options = { action, port: 2999, script: undefined };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--port") {
      options.port = Number(rest[++index]);
    } else if (argument === "--script") {
      options.script = rest[++index];
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port <= 0) {
    fail("--port must be a positive integer");
  }
  if (action !== "prepare" && action !== "probe") {
    fail("Action must be prepare or probe");
  }
  if (action === "probe" && !options.script) {
    fail("probe requires --script");
  }
  return options;
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function inspectorSocketUrl(port) {
  const deadline = Date.now() + 30_000;
  const inspectorUrl = `http://127.0.0.1:${port}/`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(inspectorUrl);
      const html = await response.text();
      const path = html.match(/\/socket\/[^'"?]+\/WebPage/)?.[0];
      if (path) {
        return `ws://127.0.0.1:${port}${path}`;
      }
    } catch {
      // The inspector is not accepting connections yet.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Inspector did not become ready at ${inspectorUrl}`);
}

class WebKitRemote {
  constructor(url) {
    this.url = url;
    this.socket = undefined;
    this.targetId = undefined;
    this.nextOuterId = 0;
    this.nextInnerId = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting to the inspector")),
        10_000,
      );
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (
          message.method === "Target.targetCreated" &&
          message.params.targetInfo.type === "page" &&
          !this.targetId
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
        const callbacks = this.pending.get(inner.id);
        if (!callbacks) {
          return;
        }
        this.pending.delete(inner.id);
        if (inner.error) {
          callbacks.reject(new Error(inner.error.message));
        } else {
          callbacks.resolve(inner.result);
        }
      });
      this.socket.addEventListener("error", () => {
        if (!this.targetId) {
          clearTimeout(timeout);
          reject(new Error("Inspector WebSocket connection failed"));
        }
      });
    });
  }

  async evaluate(expression) {
    const innerId = ++this.nextInnerId;
    const response = new Promise((resolve, reject) => {
      this.pending.set(innerId, { resolve, reject });
    });
    this.socket.send(
      JSON.stringify({
        id: ++this.nextOuterId,
        method: "Target.sendMessageToTarget",
        params: {
          targetId: this.targetId,
          message: JSON.stringify({
            id: innerId,
            method: "Runtime.evaluate",
            params: {
              expression,
              returnByValue: true,
            },
          }),
        },
      }),
    );
    const result = await response;
    if (result.wasThrown) {
      throw new Error(
        result.result.description ?? result.result.value ?? "Evaluation failed",
      );
    }
    return result.result.value;
  }

  close() {
    this.socket?.close();
  }
}

async function prepare(remote) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await remote.evaluate(`(() => {
      const gotIt = [...document.querySelectorAll("button")].find(
        (button) => button.innerText.trim() === "Got it!",
      );
      gotIt?.click();
      if (location.pathname !== "/my-mods") {
        document.querySelector('a[href="/my-mods"]')?.click();
      }
      return {
        path: location.pathname,
        hasSearch: Boolean(document.querySelector("input#search")),
        hasFixture: document.body.innerText.includes("Fixture Mod 0000"),
      };
    })()`);
    if (state.path === "/my-mods" && state.hasSearch && state.hasFixture) {
      console.log(JSON.stringify(state));
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    "My Mods did not render the isolated fixture within 30 seconds",
  );
}

async function probe(remote, scriptPath) {
  const script = await readFile(scriptPath, "utf8");
  await remote.evaluate(script);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await remote.evaluate(`globalThis.${RESULT_KEY}`);
    if (result) {
      if (result.error) {
        throw new Error(result.error);
      }
      console.log(JSON.stringify(result));
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Webview probe did not finish within 60 seconds");
}

const options = parseArguments(process.argv.slice(2));
let remote;
try {
  remote = new WebKitRemote(await inspectorSocketUrl(options.port));
  await remote.connect();
  if (options.action === "prepare") {
    await prepare(remote);
  } else {
    await probe(remote, options.script);
  }
  remote.close();
} catch (error) {
  remote?.close();
  fail(error instanceof Error ? error.message : String(error));
}
