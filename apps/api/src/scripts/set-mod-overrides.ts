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

import { db, ModRepository } from "@deadlock-mods/database";
import type { ModOverrides } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { z } from "zod";

const ModOverridesSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    hero: z.string().optional(),
    isMap: z.boolean().optional(),
    isAudio: z.boolean().optional(),
    isNSFW: z.boolean().optional(),
    isObsolete: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.object({ mapName: z.string().optional() }).optional(),
    downloads: z
      .array(
        z.object({
          url: z.string().url(),
          file: z.string(),
        }),
      )
      .optional(),
  })
  .strict();

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

  const modRepository = new ModRepository(db);

  try {
    const existing =
      await modRepository.findByRemoteIdIncludingBlacklisted(remoteId);
    if (!existing) {
      console.error(`Mod with remoteId "${remoteId}" not found.`);
      process.exit(1);
    }

    console.log(`\nMod: ${existing.name} (remoteId: ${remoteId})`);
    console.log(`Current overrides: ${JSON.stringify(existing.overrides)}`);

    let overrides: ModOverrides | null;

    if (overridesArg === "--clear") {
      overrides = null;
      console.log("\nClearing overrides...");
    } else {
      const parsed = JSON.parse(overridesArg);
      const validated = ModOverridesSchema.parse(parsed);
      overrides = validated;
      console.log(`\nSetting overrides: ${JSON.stringify(overrides)}`);
    }

    const updated = await modRepository.updateByRemoteId(remoteId, {
      overrides,
    });

    logger
      .withMetadata({
        remoteId,
        modName: updated.name,
        overrides: updated.overrides,
      })
      .info("Updated mod overrides");

    console.log(`\nUpdated overrides: ${JSON.stringify(updated.overrides)}`);
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
