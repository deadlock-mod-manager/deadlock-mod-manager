import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExtractionError, ProviderError } from "@deadlock-mods/common";
import { downloadArchive, inspectZip } from "./archive";

const archive = await readFile(
  join(import.meta.dir, "../../../../examples/mod-source/files/example.zip"),
);
let directory: string;
const servers: ReturnType<typeof Bun.serve>[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "hosted-archive-test-"));
});
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
  await rm(directory, { recursive: true, force: true });
});

const serve = (response: () => Response) => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: response });
  servers.push(server);
  return server.url.href;
};
const download = (url: string, target = join(directory, "pack.zip")) =>
  downloadArchive({ url, target, userAgent: "hosted-source-test" });

describe("hosted archive I/O", () => {
  it("writes the exact archive bytes and hashes them before inspection", async () => {
    const url = serve(
      () => new Response(archive, { headers: { etag: '"pack-v1"' } }),
    );
    const result = await download(url);
    const target = join(directory, "pack.zip");

    expect(await readFile(target)).toEqual(archive);
    expect(result).toEqual({
      etag: '"pack-v1"',
      lastModified: null,
      sha256: createHash("sha256").update(archive).digest("hex"),
      size: archive.byteLength,
    });
    expect((await inspectZip(target, [])).vpkPaths).toEqual(["example.vpk"]);
  });

  it("rejects a destination write failure instead of hanging or crashing", async () => {
    const url = serve(() => new Response(archive));
    await expect(
      download(url, join(directory, "missing", "pack.zip")),
    ).rejects.toThrow();
  });

  it("rejects redirects outside the declared download origin", async () => {
    const elsewhere = serve(() => new Response(archive));
    const url = serve(() => Response.redirect(elsewhere, 302));
    await expect(download(url)).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects corrupt ZIP bytes instead of publishing an empty inventory", async () => {
    const target = join(directory, "pack.zip");
    await writeFile(target, "not a ZIP");
    await expect(inspectZip(target, [])).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });
});
