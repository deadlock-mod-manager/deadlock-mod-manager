import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { processExists } from "./process-control";
import { assertOwnedWorld } from "./world";
import { readPersistedDocument } from "./observations";

export const assertInterruptedExit = async (
  world: string,
  phase: string,
): Promise<void> => {
  const { configuration } = await assertOwnedWorld(world);
  const evidence = z
    .object({
      processId: z.number().int().positive(),
      runId: z.string(),
      caseId: z.string(),
      phase: z.string(),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", `phase-started-${phase}.json`),
          "utf8",
        ),
      ),
    );
  assert.equal(evidence.runId, configuration.runId);
  assert.equal(evidence.caseId, configuration.caseId);
  assert.equal(evidence.phase, phase);
  assert.equal(
    processExists(evidence.processId),
    false,
    "Interrupted application must exit before restart",
  );
};

export const assertNormalExit = async (
  world: string,
  phase: string,
): Promise<void> => {
  const { configuration } = await assertOwnedWorld(world);
  const evidence = z
    .object({
      processId: z.number().int().positive(),
      runId: z.string(),
      caseId: z.string(),
      phase: z.string(),
      document: z.json(),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", `phase-completed-${phase}.json`),
          "utf8",
        ),
      ),
    );
  assert.equal(evidence.runId, configuration.runId);
  assert.equal(evidence.caseId, configuration.caseId);
  assert.equal(evidence.phase, phase);
  assert.equal(
    processExists(evidence.processId),
    false,
    "Application must exit before restart",
  );
  assert.deepEqual(
    await readPersistedDocument(world),
    evidence.document,
    "State changed after normal exit",
  );
};
