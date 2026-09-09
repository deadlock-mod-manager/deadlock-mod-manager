#!/usr/bin/env bun

/**
 * Script to set or clear manual overrides on a mod.
 * Overrides persist across sync runs and take precedence over synced data.
 *
 * Usage:
 *   pnpm --filter api set-mod-overrides -- <remoteId> <json-overrides>
 *   pnpm --filter api set-mod-overrides -- <remoteId> --clear
 *
 * Examples:
 *   pnpm --filter api set-mod-overrides -- 12345 '{"metadata":{"mapName":"my_custom_map"}}'
 *   pnpm --filter api set-mod-overrides -- 12345 '{"category":"Maps","isMap":true}'
 *   pnpm --filter api set-mod-overrides -- 12345 '{"downloads":[{"url":"https://example.com/fixed.zip","file":"fixed.zip"}]}'
 *   pnpm --filter api set-mod-overrides -- 12345 --clear
 */

import { db, PolicyRuleRepository } from "@deadlock-mods/database";
import {
  type PolicyMetadataCorrection,
  policyMetadataCorrectionSchema,
} from "@deadlock-mods/shared";
import { logger } from "@/lib/logger";
import { z } from "zod";

const setModOverrides = async () => {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: set-mod-overrides <remoteId> <json-overrides | --clear>",
    );
    process.exit(1);
  }

  const remoteId = args[0];
  const overridesArg = args[1];
  const match = /^(snd-)?([1-9]\d*)$/.exec(remoteId);
  if (!match?.[2]) {
    console.error("remoteId must be a numeric mod ID or snd-{id} sound slug.");
    process.exit(1);
  }
  const identity = {
    provider: "gamebanana" as const,
    submissionType: match[1] ? ("sound" as const) : ("mod" as const),
    submissionId: match[2],
  };

  const policyRepository = new PolicyRuleRepository(db);

  try {
    const existing = await policyRepository.find(
      identity,
      "metadata_correction",
    );
    console.log(`Current correction: ${JSON.stringify(existing?.correction)}`);

    let overrides: PolicyMetadataCorrection | null;

    if (overridesArg === "--clear") {
      overrides = null;
      console.log("\nClearing overrides...");
    } else {
      const parsed = JSON.parse(overridesArg);
      const validated = policyMetadataCorrectionSchema.parse(parsed);
      overrides = validated;
      console.log(`\nSetting overrides: ${JSON.stringify(overrides)}`);
    }

    if (overrides) {
      await policyRepository.upsert({
        ...identity,
        kind: "metadata_correction",
        correction: overrides,
      });
    } else {
      await policyRepository.delete(identity, "metadata_correction");
    }

    logger
      .withMetadata({
        remoteId,
        submissionType: identity.submissionType,
        submissionId: identity.submissionId,
      })
      .info("Updated mod overrides");

    console.log("\nPolicy metadata correction updated.");
    process.exit(0);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("\nInvalid overrides format:");
      for (const issue of error.issues) {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
      process.exit(1);
    }
    if (error instanceof SyntaxError) {
      console.error(`\nInvalid JSON: ${error.message}`);
      process.exit(1);
    }
    logger.withError(error).error("Failed to set mod overrides");
    console.error(error);
    process.exit(1);
  }
};

if (import.meta.main) {
  setModOverrides();
}
