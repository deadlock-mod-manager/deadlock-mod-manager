import { expect, it } from "bun:test";
import { request } from "node:http";
import { setTimeout } from "node:timers/promises";
import { startFixtureServer } from "./fixture-server";

it("closes its listener when constructing routes fails", async () => {
  let origin = "";
  await expect(
    startFixtureServer((value) => {
      origin = value;
      throw new Error("recipe failed");
    }),
  ).rejects.toThrow("recipe failed");
  await expect(fetch(`${origin}/__health`)).rejects.toThrow();
});

it("bounds shutdown while a transfer is active", async () => {
  const server = await startFixtureServer([
    {
      method: "GET",
      path: "/slow",
      status: 200,
      body: Buffer.alloc(10000),
      chunkBytes: 1,
      chunkDelayMs: 1000,
    },
  ]);
  const response = await fetch(`${server.origin}/slow`);
  const body = response.arrayBuffer().catch(() => null);
  const started = Date.now();
  await server.close();
  await body;
  expect(Date.now() - started).toBeLessThan(3000);
  expect(server.requests()[0].responseBytes).toBeLessThan(10000);
});

it("journals an aborted request body without an unhandled rejection", async () => {
  const server = await startFixtureServer();
  try {
    const outgoing = request(`${server.origin}/upload`, {
      method: "POST",
      headers: { "content-length": "100" },
    });
    outgoing.on("error", () => {});
    outgoing.write("partial");
    await setTimeout(100);
    outgoing.destroy();
    for (let i = 0; i < 50 && server.unmatchedRequests().length === 0; i++)
      await setTimeout(20);
    expect(server.unmatchedRequests()).toHaveLength(1);
    expect(server.unmatchedRequests()[0].error).toBeDefined();
  } finally {
    await server.close();
  }
});
