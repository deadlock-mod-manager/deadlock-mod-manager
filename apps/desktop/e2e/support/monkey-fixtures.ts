import { writeFile } from "node:fs/promises";
import path from "node:path";
import { multipakUpdateRoutes } from "./multipak-update-fixtures";
import { monkeyEnvironment } from "./monkey-plan";
import { prepareProfileWorld } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const monkeyRoutes = async () => {
  const plan = monkeyEnvironment();
  const routes = await multipakUpdateRoutes();
  return (origin: string) =>
    routes(origin).map((route) => {
      const id = /^\/dl\/(\d+)\/v2$/.exec(route.path)?.[1];
      return id && plan.downloadFaults.includes(id)
        ? Object.assign(route, {
            sequence: [
              { status: 401, body: "Seeded monkey transfer failure" },
              { status: route.status, body: route.body },
            ],
          })
        : route;
    });
};

export const prepareMonkeyWorld = async (world: CreatedWorld) => {
  await prepareProfileWorld(world);
  await writeFile(
    path.join(world.artifactsDirectory, "monkey-steps.json"),
    JSON.stringify(monkeyEnvironment(), null, 2),
  );
};
