import { expect, it } from "bun:test";
import { z } from "zod";
import { contentMods, contentRoutes } from "./content-fixtures";
import { startFixtureServer } from "./fixture-server";

it("keeps content submissions downloadable when detail hydration refreshes the catalog", async () => {
  const server = await startFixtureServer(await contentRoutes());
  const fileSchema = z.object({
    _idRow: z.number(),
    _sDownloadUrl: z.string(),
  });
  const filesSchema = z.object({ _aFiles: z.array(fileSchema) });
  try {
    for (const mod of contentMods) {
      const { _aFiles: detailFiles } = filesSchema.parse(
        await (
          await fetch(`${server.origin}/apiv11/Mod/${mod.id}/ProfilePage`)
        ).json(),
      );
      const { _aFiles: downloadFiles } = filesSchema.parse(
        await (
          await fetch(`${server.origin}/apiv11/Mod/${mod.id}/DownloadPage`)
        ).json(),
      );
      expect(detailFiles.length).toBeGreaterThan(0);
      expect(downloadFiles).toEqual(detailFiles);
      for (const { _sDownloadUrl: downloadUrl } of detailFiles) {
        const response = await fetch(downloadUrl);
        expect(response.status).toBe(200);
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    }
    expect(server.unmatchedRequests()).toHaveLength(0);
  } finally {
    await server.close();
  }
});
