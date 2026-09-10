import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type FixtureRequest = {
  at: string;
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  bodyBytes: number;
  responseStatus?: number;
  responseBytes?: number;
};

export type FixtureResponse = {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
  range?: boolean;
  chunkBytes?: number;
  chunkDelayMs?: number;
  disconnectAfterBytes?: number;
};

export type FixtureRoute = FixtureResponse & {
  method: string;
  path: string;
  sequence?: readonly FixtureResponse[];
};

export type FixtureServer = {
  origin: string;
  unmatchedRequests: () => readonly FixtureRequest[];
  requests: () => readonly FixtureRequest[];
  close: (artifactsDirectory?: string) => Promise<void>;
};

const sendFixture = async (
  request: IncomingMessage,
  response: ServerResponse,
  fixture: FixtureResponse,
  record: FixtureRequest,
): Promise<void> => {
  const body = Buffer.isBuffer(fixture.body)
    ? fixture.body
    : Buffer.from(fixture.body);
  let offset = 0;
  let status = fixture.status;
  const headers = {
    "content-type": Buffer.isBuffer(fixture.body)
      ? "application/octet-stream"
      : "application/json",
    ...fixture.headers,
  };
  if (fixture.range && request.headers.range) {
    const match = /^bytes=(\d+)-$/.exec(request.headers.range);
    offset = match ? Number(match[1]) : body.length;
    if (!Number.isSafeInteger(offset) || offset >= body.length) {
      record.responseStatus = 416;
      record.responseBytes = 0;
      response.writeHead(416, { "content-range": `bytes */${body.length}` });
      response.end();
      return;
    }
    status = 206;
    response.setHeader(
      "content-range",
      `bytes ${offset}-${body.length - 1}/${body.length}`,
    );
  }
  record.responseStatus = status;
  record.responseBytes = 0;
  response.writeHead(status, {
    "content-length": String(body.length - offset),
    ...headers,
  });
  const limit =
    fixture.disconnectAfterBytes === undefined
      ? body.length
      : Math.min(body.length, offset + fixture.disconnectAfterBytes);
  const chunkBytes = fixture.chunkBytes ?? (body.length || 1);
  while (offset < limit && !response.destroyed) {
    const chunk = body.subarray(offset, Math.min(offset + chunkBytes, limit));
    response.write(chunk);
    record.responseBytes += chunk.length;
    offset += chunk.length;
    if (fixture.chunkDelayMs)
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          response.off("close", done);
          resolve();
        };
        const timer = setTimeout(done, fixture.chunkDelayMs);
        response.once("close", done);
      });
  }
  if (fixture.disconnectAfterBytes !== undefined) response.destroy();
  else response.end();
};

const isSensitiveHeader = (name: string): boolean =>
  /(?:authorization|authentication|cookie|token|secret|password|api[-_]?key)/i.test(
    name,
  );

const redactUrl = (value: string): string => {
  const absolute = /^https?:\/\//i.test(value);
  const url = new URL(value, "http://127.0.0.1");
  for (const name of [...url.searchParams.keys()]) {
    if (
      /(?:token|secret|password|authorization|api[_-]?key|code)/i.test(name)
    ) {
      url.searchParams.set(name, "[REDACTED]");
    }
  }
  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
};

const headersFrom = (
  request: IncomingMessage,
): Record<string, string | string[]> => {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers[name] = isSensitiveHeader(name) ? "[REDACTED]" : value;
    }
  }
  return headers;
};

const respond = (
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = { "content-type": "application/json" },
): void => {
  response.writeHead(status, headers);
  response.end(body);
};

export const startFixtureServer = async (
  routes: readonly FixtureRoute[] = [],
): Promise<FixtureServer> => {
  const journal: FixtureRequest[] = [];
  const unmatched: FixtureRequest[] = [];
  const occurrences = new Map<FixtureRoute, number>();
  const server = createServer(async (request, response) => {
    let bodyBytes = 0;
    for await (const chunk of request) {
      bodyBytes += Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(chunk);
    }
    const record: FixtureRequest = {
      at: new Date().toISOString(),
      method: request.method ?? "GET",
      url: redactUrl(request.url ?? "/"),
      headers: headersFrom(request),
      bodyBytes,
    };
    journal.push(record);

    if (request.url === "/__health") {
      respond(response, 200, JSON.stringify({ ok: true }));
      return;
    }
    if (request.url?.startsWith("/__control")) {
      respond(response, 200, JSON.stringify({ ok: true }));
      return;
    }
    if (/^https?:\/\//i.test(record.url)) {
      unmatched.push(record);
      respond(
        response,
        502,
        JSON.stringify({
          error: "E2E fixture proxy blocked external transport",
          method: record.method,
          url: record.url,
        }),
      );
      return;
    }
    const requestPath = new URL(request.url ?? "/", "http://127.0.0.1")
      .pathname;
    const route = routes.find(
      (candidate) =>
        candidate.method.toUpperCase() === record.method.toUpperCase() &&
        candidate.path === requestPath,
    );
    if (route) {
      const index = occurrences.get(route) ?? 0;
      occurrences.set(route, index + 1);
      const fixture =
        route.sequence?.[Math.min(index, route.sequence.length - 1)] ?? route;
      await sendFixture(request, response, fixture, record);
      return;
    }
    unmatched.push(record);
    respond(
      response,
      501,
      JSON.stringify({
        error: "No deterministic fixture registered",
        method: record.method,
        url: record.url,
      }),
    );
  });
  server.on("connect", (request, socket) => {
    socket.on("error", () => {
      // A blocked HTTPS client commonly resets the denied tunnel. The request
      // remains recorded and the reset must not crash the supervisor.
    });
    const record: FixtureRequest = {
      at: new Date().toISOString(),
      method: "CONNECT",
      url: redactUrl(request.url ?? "/"),
      headers: headersFrom(request),
      bodyBytes: 0,
    };
    journal.push(record);
    unmatched.push(record);
    socket.end(
      "HTTP/1.1 502 E2E fixture proxy blocked external transport\r\n\r\n",
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fixture server did not bind a TCP port");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    unmatchedRequests: () => unmatched,
    requests: () => journal,
    close: async (artifactsDirectory) => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (artifactsDirectory === undefined) return;
      await mkdir(artifactsDirectory, { recursive: true });
      await writeFile(
        path.join(artifactsDirectory, "network.ndjson"),
        journal.map((record) => JSON.stringify(record)).join("\n") +
          (journal.length > 0 ? "\n" : ""),
      );
    },
  };
};
