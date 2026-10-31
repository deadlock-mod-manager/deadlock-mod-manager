import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { connect } from "node:net";
import os from "node:os";
import path from "node:path";
import { startFixtureServer } from "./fixture-server";

const proxyRequest = async (
  origin: string,
  method: "CONNECT" | "GET",
  target: string,
): Promise<number> => {
  const fixtureUrl = new URL(origin);
  if (method === "CONNECT") {
    return await new Promise<number>((resolve, reject) => {
      const socket = connect(Number(fixtureUrl.port), fixtureUrl.hostname);
      socket.once("error", reject);
      socket.once("data", (data) => {
        const match = data.toString().match(/^HTTP\/1\.1 (\d{3})/);
        socket.destroy();
        resolve(Number(match?.[1] ?? 0));
      });
      socket.once("connect", () => {
        socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
      });
    });
  }
  return await new Promise<number>((resolve, reject) => {
    const outgoing = request(
      {
        host: fixtureUrl.hostname,
        port: fixtureUrl.port,
        method,
        path: target,
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
};

describe("fixture network", () => {
  it("serves exact binary ranges and deterministic failure sequences", async () => {
    const body = Buffer.from([0, 255, 128, 1, 2, 3, 4, 5]);
    const good = {
      status: 200,
      body,
      range: true,
      headers: { etag: '"fixture"' },
    };
    const server = await startFixtureServer([
      {
        method: "GET",
        path: "/file",
        ...good,
        sequence: [{ status: 401, body: "denied" }, good],
      },
    ]);
    try {
      const denied = await fetch(`${server.origin}/file`);
      expect(denied.status).toBe(401);
      await denied.text();
      const resumed = await fetch(`${server.origin}/file`, {
        headers: { range: "bytes=3-" },
      });
      expect(resumed.status).toBe(206);
      expect(resumed.headers.get("content-range")).toBe("bytes 3-7/8");
      expect(Buffer.from(await resumed.arrayBuffer())).toEqual(
        body.subarray(3),
      );
      const invalid = await fetch(`${server.origin}/file`, {
        headers: { range: "bytes=99-" },
      });
      expect(invalid.status).toBe(416);
      await invalid.text();
      expect(server.requests().map((entry) => entry.responseStatus)).toEqual([
        401, 206, 416,
      ]);
      expect(server.unmatchedRequests()).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it("cuts a streamed response short and permits its remaining range", async () => {
    const body = Buffer.alloc(65536, 7);
    const good = { status: 200, body, range: true };
    const server = await startFixtureServer([
      {
        method: "GET",
        path: "/file",
        ...good,
        sequence: [
          {
            ...good,
            disconnectAfterBytes: 16384,
            chunkBytes: 8192,
            chunkDelayMs: 20,
          },
          good,
        ],
      },
    ]);
    try {
      const broken = await fetch(`${server.origin}/file`);
      await expect(broken.arrayBuffer()).rejects.toThrow();
      const resumed = await fetch(`${server.origin}/file`, {
        headers: { range: "bytes=16384-" },
      });
      expect(Buffer.from(await resumed.arrayBuffer())).toEqual(
        body.subarray(16384),
      );
      expect(server.requests()[0].responseBytes).toBe(16384);
    } finally {
      await server.close();
    }
  });

  it("serves closed ranges, misplaced ranges and repeated sequence entries", async () => {
    const body = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const good = { status: 200, body, range: true };
    const server = await startFixtureServer([
      {
        method: "GET",
        path: "/file",
        ...good,
        sequence: [
          { ...good, repeat: 2 },
          { ...good, rangeFrom: { at: 4, serveFrom: 5 } },
        ],
      },
    ]);
    const get = async (range: string) => {
      const response = await fetch(`${server.origin}/file`, {
        headers: { range },
      });
      return {
        status: response.status,
        contentRange: response.headers.get("content-range"),
        body: Buffer.from(await response.arrayBuffer()),
      };
    };
    try {
      expect(await get("bytes=2-4")).toEqual({
        status: 206,
        contentRange: "bytes 2-4/10",
        body: body.subarray(2, 5),
      });
      // The first entry answers twice, so this one is still served honestly.
      expect((await get("bytes=4-6")).contentRange).toBe("bytes 4-6/10");
      expect(await get("bytes=4-6")).toEqual({
        status: 206,
        contentRange: "bytes 5-7/10",
        body: body.subarray(5, 8),
      });
      expect((await get("bytes=4-")).contentRange).toBe("bytes 5-9/10");
      expect((await get("bytes=8-99")).contentRange).toBe("bytes 8-9/10");
      const anyRange = await startFixtureServer([
        {
          method: "GET",
          path: "/file",
          ...good,
          rangeFrom: { serveFrom: 0 },
        },
      ]);
      try {
        const response = await fetch(`${anyRange.origin}/file`, {
          headers: { range: "bytes=3-" },
        });
        expect(response.headers.get("content-range")).toBe("bytes 0-9/10");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
      } finally {
        await anyRange.close();
      }
      const requests = server.requests();
      expect(requests.every((entry) => entry.remotePort !== undefined)).toBe(
        true,
      );
      expect(
        requests.every(
          (entry) => entry.endedAt !== undefined && entry.endedAt >= entry.at,
        ),
      ).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("serves registered responses and journals matched and unmatched requests", async () => {
    const artifacts = await mkdtemp(
      path.join(os.tmpdir(), "dmm-network-test-"),
    );
    const server = await startFixtureServer([
      {
        method: "GET",
        path: "/api/mods",
        status: 200,
        headers: { "content-type": "application/json" },
        body: '[{"id":42}]',
      },
    ]);
    try {
      const matched = await fetch(
        `${server.origin}/api/mods?sort=new&access_token=query-secret`,
        {
          headers: {
            authorization: "Bearer header-secret",
            authentication: "alternate-auth-secret",
            cookie: "session=cookie-secret",
            "x-api-key": "api-key-secret",
            "x-access-token": "access-header-secret",
            "x-refresh-token": "refresh-header-secret",
          },
        },
      );
      expect(await matched.json()).toEqual([{ id: 42 }]);
      const unmatched = await fetch(`${server.origin}/unexpected`, {
        method: "POST",
        body: "payload",
      });
      expect(unmatched.status).toBe(501);
      expect(server.unmatchedRequests()).toHaveLength(1);
      expect(server.unmatchedRequests()[0]?.url).toBe("/unexpected");
    } finally {
      await server.close(artifacts);
    }
    const journal = await readFile(
      path.join(artifacts, "network.ndjson"),
      "utf8",
    );
    expect(journal).toContain("%5BREDACTED%5D");
    expect(journal).toContain('"authorization":"[REDACTED]"');
    expect(journal).not.toContain("query-secret");
    expect(journal).not.toContain("header-secret");
    expect(journal).not.toContain("cookie-secret");
    expect(journal).not.toContain("api-key-secret");
    expect(journal).not.toContain("alternate-auth-secret");
    expect(journal).not.toContain("access-header-secret");
    expect(journal).not.toContain("refresh-header-secret");
    expect(journal).toContain('"bodyBytes":7');
    await rm(artifacts, { recursive: true, force: true });
  });

  it("blocks and records HTTP and HTTPS proxy attempts", async () => {
    const artifacts = await mkdtemp(path.join(os.tmpdir(), "dmm-proxy-test-"));
    const server = await startFixtureServer([
      {
        method: "GET",
        path: "/allowed",
        status: 200,
        body: "{}",
      },
    ]);
    try {
      expect(
        await proxyRequest(server.origin, "GET", "http://example.test/allowed"),
      ).toBe(502);
      expect(
        await proxyRequest(server.origin, "CONNECT", "example.test:443"),
      ).toBe(502);
      expect(server.unmatchedRequests().map((entry) => entry.method)).toEqual([
        "GET",
        "CONNECT",
      ]);
    } finally {
      await server.close(artifacts);
      await rm(artifacts, { recursive: true, force: true });
    }
  });
});
