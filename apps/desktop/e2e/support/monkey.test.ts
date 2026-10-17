import { describe, expect, it } from "bun:test";
import { readFile, writeFile, mkdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createMonkeyPlan,
  monkeyEnvironment,
  monkeyReplay,
  mulberry32,
} from "./monkey-plan";
import { monkeyRoutes } from "./monkey-fixtures";
import {
  assertMonkeyInvariants,
  readMonkeyManifest,
  type MonkeyModel,
} from "./monkey-oracle";
import { startFixtureServer } from "./fixture-server";
import { readPersistedDocument } from "./observations";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  BETA_MODS,
  prepareProfileWorld,
} from "./profile-fixtures";
import { createWorld, removeOwnedWorld } from "./world";

describe("monkey replay", () => {
  it("defaults to seed 0 and 25 steps when the environment omits them", () => {
    const previousSeed = process.env.DMM_E2E_SEED;
    const previousSteps = process.env.DMM_E2E_STEPS;
    delete process.env.DMM_E2E_SEED;
    delete process.env.DMM_E2E_STEPS;
    try {
      const plan = monkeyEnvironment();
      expect(plan.seed).toBe(0);
      expect(plan.stepCount).toBe(25);
    } finally {
      if (previousSeed === undefined) delete process.env.DMM_E2E_SEED;
      else process.env.DMM_E2E_SEED = previousSeed;
      if (previousSteps === undefined) delete process.env.DMM_E2E_STEPS;
      else process.env.DMM_E2E_STEPS = previousSteps;
    }
  });
  it("has a stable PRNG stream, including seed zero, and deterministic prefixes", () => {
    const random = mulberry32(0);
    expect([random(), random(), random()]).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
    ]);
    const first = createMonkeyPlan(887, 25);
    expect(createMonkeyPlan(887, 25)).toEqual(first);
    expect(createMonkeyPlan(887, 7).planned).toEqual(first.planned.slice(0, 7));
    expect(createMonkeyPlan(888, 25).planned).not.toEqual(first.planned);
    expect(monkeyReplay(first, 3)).toContain(
      "DMM_E2E_SEED=887 DMM_E2E_STEPS=25 pnpm --filter @deadlock-mods/desktop e2e:test -- --case monkey --keep",
    );
    expect(() => createMonkeyPlan(-1, 25)).toThrow();
    expect(() => createMonkeyPlan(1, 0)).toThrow();
  });

  it("reuses multipak bytes and returns one seeded transfer failure before recovery", async () => {
    const previous = process.env.DMM_E2E_SEED;
    process.env.DMM_E2E_SEED = "0";
    try {
      const routes = await monkeyRoutes();
      const server = await startFixtureServer(routes);
      try {
        const url = `${server.origin}/dl/930001/v2`;
        expect((await fetch(url)).status).toBe(401);
        expect((await fetch(url)).status).toBe(200);
        expect(server.unmatchedRequests()).toEqual([]);
      } finally {
        await server.close();
      }
    } finally {
      if (previous === undefined) delete process.env.DMM_E2E_SEED;
      else process.env.DMM_E2E_SEED = previous;
    }
  });
});

it("rejects missing bytes, duplicate owners, store drift, empty staging folders and unexpected HTTP", async () => {
  const server = await startFixtureServer();
  const world = await createWorld({
    runId: `monkey-unit-${randomUUID()}`,
    caseId: "monkey",
    attempt: 1,
    fixtureOrigin: server.origin,
  });
  try {
    await prepareProfileWorld(world);
    const model: MonkeyModel = { [ALPHA.id]: {}, [BETA.id]: {} };
    for (const id of ALPHA_MODS)
      model[ALPHA.id][id] = { enabled: true, version: "v1" };
    for (const id of BETA_MODS)
      model[BETA.id][id] = { enabled: true, version: "v1" };
    const external = new Set<string>();
    const check = () =>
      assertMonkeyInvariants(world.directory, "unit", model, external);
    await check();
    const base = path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      ALPHA.folder,
    );
    const file = path.join(base, "pak01_dir.vpk");
    const bytes = await readFile(file);
    await unlink(file);
    await expect(check()).rejects.toThrow("missing or wrong payload");
    await writeFile(file, bytes);
    await writeFile(file, Buffer.from("Wrong VPK bytes"));
    await expect(check()).rejects.toThrow("missing or wrong payload");
    await writeFile(file, bytes);
    await assertMonkeyInvariants(
      world.directory,
      "modded",
      model,
      external,
      new Set(),
      "modded",
    );
    await expect(
      assertMonkeyInvariants(
        world.directory,
        "vanilla",
        model,
        external,
        new Set(),
        "vanilla",
      ),
    ).rejects.toThrow("Vanilla launch search paths");
    const manifest = await readMonkeyManifest(base);
    const original = JSON.stringify(manifest);
    manifest.mods[ALPHA_MODS[1]].currentVpks =
      manifest.mods[ALPHA_MODS[0]].currentVpks;
    await writeFile(path.join(base, ".dmm.json"), JSON.stringify(manifest));
    await expect(check()).rejects.toThrow("Duplicate manifest owner");
    await writeFile(path.join(base, ".dmm.json"), original);
    const added = path.join(base, "external.vpk");
    await writeFile(added, bytes);
    await expect(check()).rejects.toThrow("Unowned VPK");
    external.add(`addons/${ALPHA.folder}/external.vpk`);
    await check();
    await unlink(added);
    await expect(check()).rejects.toThrow(
      "External VPK disappeared before Repair",
    );
    external.clear();
    const staging = path.join(base, ".dmm-reorder");
    await mkdir(staging);
    await expect(check()).rejects.toThrow("Leftover transaction");
    await rmdir(staging);
    const persisted = await readPersistedDocument(world.directory);
    const statePath = path.join(
      world.configuration.roots.appData,
      "state.json",
    );
    const saved = await readFile(statePath);
    const drift = JSON.stringify(persisted).replace(
      '"status":"installed"',
      '"status":"downloaded"',
    );
    await writeFile(statePath, JSON.stringify({ "local-config": drift }));
    await expect(check()).rejects.toThrow();
    await writeFile(statePath, saved);
    await fetch(`${server.origin}/unexpected`);
    await expect(check()).rejects.toThrow("Unexpected HTTP requests");
  } finally {
    await server.close();
    await removeOwnedWorld(world.directory);
  }
});
