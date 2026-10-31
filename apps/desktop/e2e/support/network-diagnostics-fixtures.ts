import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FixtureRoute } from "./fixture-server";
import { createCatalogRoutes } from "./gamebanana-fixtures";
import type { CreatedWorld } from "./world";

export const networkDiagnosticsRoutes = async (id: string) => {
  const catalog = await createCatalogRoutes("gamebanana-single");
  return (origin: string): FixtureRoute[] => [
    {
      method: "GET",
      path: "/cdn-cgi/trace",
      status: 200,
      body: "ip=127.0.0.1\n",
      // Closes the connection before any response, as a blocked host would.
      disconnectAfterBytes:
        id === "network-diagnostics-internet-down" ? 0 : undefined,
    },
    {
      method: "GET",
      path: "/health/ready",
      status: 200,
      body: '{"status":"ok"}',
    },
    {
      method: "GET",
      path: "/v1/assets/ranked-seasons",
      status: 200,
      body: "[]",
    },
    ...catalog(origin),
  ];
};

// The E2E backend reads this instead of the host's real CIM setting.
export const prepareNetworkDiagnosticsWorld = async (world: CreatedWorld) => {
  const fixtures = path.join(world.directory, "fixtures");
  await mkdir(fixtures, { recursive: true });
  await writeFile(path.join(fixtures, "tcp-autotuning-level"), "0\n");
};
