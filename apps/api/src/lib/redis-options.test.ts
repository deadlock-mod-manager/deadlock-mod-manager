import { describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import IORedis from "ioredis";
import { z } from "zod";
import { redisConnectionOptions } from "./redis-options";

describe("Redis primary recovery", () => {
  for (const message of [
    "READONLY You can't write against a read only replica.",
    "ERR Error running script: @user_script:215: -READONLY You can't write against a read only replica.",
  ]) {
    it(`reconnects and resends a rejected command: ${message}`, async () => {
      let connections = 0;
      const server = createServer((socket) => {
        const connection = ++connections;
        socket.on("data", () =>
          socket.write(connection === 1 ? `-${message}\r\n` : "+PONG\r\n"),
        );
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = z
        .object({ port: z.number().int().positive() })
        .parse(server.address());
      const redis = new IORedis(address.port, "127.0.0.1", {
        ...redisConnectionOptions,
        enableReadyCheck: false,
        disableClientInfo: true,
      });
      try {
        expect(await redis.ping()).toBe("PONG");
        expect(connections).toBe(2);
      } finally {
        redis.disconnect();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  }

  it("does not reconnect or resend unrelated errors", () => {
    const reconnect = redisConnectionOptions.reconnectOnError;
    if (!reconnect) throw new Error("Missing reconnect handler");
    expect(
      reconnect(
        new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        ),
      ),
    ).toBe(false);
    expect(reconnect(new Error("ERR script failed"))).toBe(false);
  });
});
