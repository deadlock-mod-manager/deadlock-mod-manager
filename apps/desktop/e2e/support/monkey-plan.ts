import { z } from "zod";

const weights = {
  update: 6,
  toggle: 6,
  profile: 4,
  reorder: 2,
  uninstall: 1,
  install: 2,
  modded: 2,
  vanilla: 1,
  repair: 2,
  "external-add": 1,
  "external-delete": 1,
  lock: 1,
} satisfies Record<MonkeyStep["operation"], number>;
const operations = Object.entries(weights).flatMap(([operation, weight]) =>
  Array.from({ length: weight }, () => operation),
);
const monkeyStepSchema = z.object({
  operation: z.enum([
    "update",
    "toggle",
    "profile",
    "reorder",
    "uninstall",
    "install",
    "modded",
    "vanilla",
    "repair",
    "external-add",
    "external-delete",
    "lock",
  ]),
  choice: z.number(),
});
export type MonkeyStep = z.infer<typeof monkeyStepSchema>;
export const monkeyPlanSchema = z.object({
  seed: z.number().int().min(0).max(0xffff_ffff),
  stepCount: z.number().int().min(1).max(200),
  downloadFaults: z.array(z.string()),
  planned: z.array(monkeyStepSchema),
  executed: z.array(
    z.object({
      index: z.number(),
      operation: z.string(),
      details: z.array(z.string()),
      outcome: z.enum(["running", "passed", "skipped", "failed"]),
    }),
  ),
});
export type MonkeyPlan = z.infer<typeof monkeyPlanSchema>;

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
  return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
};

export const createMonkeyPlan = (
  seed: number,
  stepCount: number,
): MonkeyPlan => {
  const random = mulberry32(seed);
  return monkeyPlanSchema.parse({
    seed,
    stepCount,
    downloadFaults: ["930001", "930002"].filter(() => random() < 0.35),
    planned: Array.from({ length: stepCount }, () => ({
      operation: operations[Math.floor(random() * operations.length)],
      choice: random(),
    })),
    executed: [],
  });
};

export const monkeyEnvironment = () => {
  const seed = z.coerce
    .number()
    .int()
    .min(0)
    .max(0xffff_ffff)
    .parse(process.env.DMM_E2E_SEED ?? 0);
  const stepCount = monkeyStepCount();
  process.env.DMM_E2E_SEED = String(seed);
  console.log(`Monkey seed: ${seed}; steps: ${stepCount}`);
  return createMonkeyPlan(seed, stepCount);
};

export const monkeyStepCount = (steps = process.env.DMM_E2E_STEPS): number =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(steps ?? 25);

export const monkeyTimeoutMs = (stepCount: number): number =>
  stepCount * 12_000;

export const monkeyReplay = (plan: MonkeyPlan, index: number) =>
  `Monkey seed ${plan.seed}, step ${index}\nReplay prefix: ${JSON.stringify(plan.executed)}\n` +
  `DMM_E2E_SEED=${plan.seed} DMM_E2E_STEPS=${plan.stepCount} pnpm --filter @deadlock-mods/desktop e2e:test -- --case monkey --keep`;
