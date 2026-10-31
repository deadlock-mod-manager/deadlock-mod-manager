/**
 * Runs the built backend.wasm through the ABI v1 exports and the
 * dmm.host_call import, with a fresh instance per call as the host does.
 * Requires `bun scripts/build.ts` first.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decode,
  type JsonObject,
  type JsonValue,
} from "@deadlock-mods/plugin-sdk";

const WASM_PATH = join(import.meta.dir, "../dist/package/backend.wasm");
const MAX_CALL_INPUT_BYTES = 256 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const backend = new WebAssembly.Module(readFileSync(WASM_PATH));

type HostRequest = { method: string; params: JsonObject };
type Envelope =
  | { ok: true; value: JsonValue }
  | { ok: false; error: { code: string; message: string } };

const hash = (build: number) => build.toString(16).padStart(64, "0");
const snapshot = (build: number): JsonObject => ({
  hash: hash(build),
  size: 2048 + build,
  resources: 4,
  stagedAt: "2026-10-30T12:00:00Z",
});

class FakeHost {
  fileName = "build_dir.vpk";
  snapshot: JsonObject = { state: "missing" };
  staged: JsonObject[] = [];
  deployed: string | null = null;
  storage = new Map<string, JsonValue>();
  denied = new Set<string>();
  methods: string[] = [];
  insufficientCapacityReplies = 0;

  answer({ method, params }: HostRequest): Envelope {
    this.methods.push(method);
    if (this.denied.has(method)) {
      return {
        ok: false,
        error: { code: "permission_denied", message: `${method} denied` },
      };
    }
    switch (method) {
      case "grants.get":
        return {
          ok: true,
          value: {
            permissions: [
              {
                id: "files",
                kind: "file",
                extensions: ["vpk"],
                access: "read",
              },
              { id: "mods", access: ["install"], profiles: "picked" },
              { id: "storage" },
            ],
            file: { name: this.fileName, kind: "file" },
            profile: { folder: "skin-testing" },
          },
        };
      case "files.snapshot":
        return {
          ok: true,
          value: { ...this.snapshot, fileName: this.fileName },
        };
      case "files.snapshots":
        return { ok: true, value: { snapshots: this.staged } };
      case "mods.installed":
        return { ok: true, value: { hash: this.deployed } };
      case "mods.install":
        this.deployed = String(params.hash);
        return { ok: true, value: { hash: this.deployed } };
      case "storage.get":
        return {
          ok: true,
          value: { value: this.storage.get(String(params.key)) ?? null },
        };
      case "storage.set":
        this.storage.set(String(params.key), params.value ?? null);
        return { ok: true, value: null };
      default:
        return {
          ok: false,
          error: { code: "unknown_method", message: method },
        };
    }
  }
}

function instantiate(host: FakeHost) {
  let memory: WebAssembly.Memory | undefined;
  let pending: { request: string; response: Uint8Array } | undefined;
  const hostCall = (
    inputPtr: number,
    inputLen: number,
    outputPtr: number,
    outputCapacity: number,
  ) => {
    if (!memory) return -1;
    const request = decoder.decode(
      new Uint8Array(memory.buffer, inputPtr, inputLen),
    );
    const response =
      pending?.request === request
        ? pending.response
        : encoder.encode(JSON.stringify(host.answer(JSON.parse(request))));
    if (response.length > outputCapacity) {
      pending = { request, response };
      host.insufficientCapacityReplies += 1;
      return -response.length;
    }
    pending = undefined;
    new Uint8Array(memory.buffer, outputPtr, response.length).set(response);
    return response.length;
  };
  const instance = new WebAssembly.Instance(backend, {
    dmm: { host_call: hostCall },
  });
  if (!(instance.exports.memory instanceof WebAssembly.Memory)) {
    throw new Error("backend.wasm does not export memory");
  }
  memory = instance.exports.memory;
  return {
    memory,
    alloc: instance.exports.alloc as (len: number) => number,
    call: instance.exports.call as (ptr: number, len: number) => bigint,
  };
}

function invoke(host: FakeHost, command: string, payload: JsonValue = {}) {
  const { memory, alloc, call } = instantiate(host);
  const input = encoder.encode(JSON.stringify({ command, payload }));
  const inputPtr = alloc(input.length);
  new Uint8Array(memory.buffer, inputPtr, input.length).set(input);
  const packed = BigInt.asUintN(64, call(inputPtr, input.length));
  const outputPtr = Number(packed >> 32n);
  const outputLen = Number(packed & 0xffffffffn);
  const envelope: Envelope = JSON.parse(
    decoder.decode(new Uint8Array(memory.buffer, outputPtr, outputLen)),
  );
  return envelope;
}

function value(envelope: Envelope): JsonObject {
  if (!envelope.ok) throw new Error(JSON.stringify(envelope.error));
  return decode.object(envelope.value);
}

describe("backend.wasm", () => {
  let host: FakeHost;
  beforeEach(() => {
    host = new FakeHost();
  });

  test("stages, deploys, and persists through storage across fresh instances", () => {
    host.snapshot = { state: "ready", snapshot: snapshot(1) };
    host.staged = [snapshot(1)];
    expect(value(invoke(host, "tick")).outcome).toBe("ready");
    const status = value(invoke(host, "status"));
    expect(status.builds).toEqual([
      { ...snapshot(1), deployed: false, available: true },
    ]);

    const deployed = value(invoke(host, "deploy", { hash: hash(1) }));
    expect(deployed.deployedHash).toBe(hash(1));
    expect(host.deployed).toBe(hash(1));
    expect(value(invoke(host, "status")).deployedHash).toBe(hash(1));
  });

  test("retries a hostcall when the response outgrows the first buffer", () => {
    host.fileName = `${"x".repeat(32 * 1024)}.vpk`;
    const status = value(invoke(host, "status"));
    expect(status.grants).toMatchObject({
      file: { name: host.fileName },
    });
    expect(host.insufficientCapacityReplies).toBe(1);
    expect(host.methods.filter((method) => method === "grants.get")).toEqual([
      "grants.get",
    ]);
  });

  test("returns denied hostcalls as structured errors", () => {
    host.staged = [snapshot(1)];
    host.snapshot = { state: "ready", snapshot: snapshot(1) };
    invoke(host, "tick");
    host.denied.add("mods.install");
    expect(invoke(host, "deploy", { hash: hash(1) })).toEqual({
      ok: false,
      error: { code: "permission_denied", message: "mods.install denied" },
    });
    expect(value(invoke(host, "status")).deployError).toEqual({
      code: "permission_denied",
      message: "mods.install denied",
    });
  });

  test("rejects malformed requests and oversized allocations", () => {
    const { memory, alloc, call } = instantiate(host);
    expect(alloc(MAX_CALL_INPUT_BYTES + 1)).toBe(0);
    expect(alloc(-1)).toBe(0);

    const input = encoder.encode("not json");
    const ptr = alloc(input.length);
    new Uint8Array(memory.buffer, ptr, input.length).set(input);
    const packed = BigInt.asUintN(64, call(ptr, input.length));
    const envelope: Envelope = JSON.parse(
      decoder.decode(
        new Uint8Array(
          memory.buffer,
          Number(packed >> 32n),
          Number(packed & 0xffffffffn),
        ),
      ),
    );
    expect(envelope).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(host.methods).toEqual([]);
  });
});
