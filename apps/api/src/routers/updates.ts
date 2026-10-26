import { Hono } from "hono";
import {
  DesktopUpdatesService,
  UPDATE_CHANNELS,
  UPDATE_MANIFESTS,
  type UpdateChannel,
  type UpdateManifestName,
} from "@/services/desktop-updates";

const MANIFEST_CACHE_SECONDS = 300;

const isChannel = (value: string): value is UpdateChannel =>
  UPDATE_CHANNELS.some((channel) => channel === value);
const isManifest = (value: string): value is UpdateManifestName =>
  UPDATE_MANIFESTS.some((manifest) => manifest === value);

const app = new Hono();

app.get("/:channel/:manifest", async (c) => {
  const { channel, manifest } = c.req.param();
  if (!isChannel(channel) || !isManifest(manifest)) {
    return c.text("Not found", 404);
  }

  try {
    const body = await DesktopUpdatesService.getInstance().getManifest(
      channel,
      manifest,
    );
    c.header(
      "Cache-Control",
      `public, max-age=${MANIFEST_CACHE_SECONDS}, s-maxage=${MANIFEST_CACHE_SECONDS}`,
    );
    return c.json(body);
  } catch {
    return c.text("Updater manifest unavailable", 502);
  }
});

export default app;
