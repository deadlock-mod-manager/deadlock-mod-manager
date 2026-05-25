import { describe, expect, it } from "bun:test";
import {
  AUTOEXEC_CATEGORIES,
  FLAT_AUTOEXEC_COMMANDS,
} from "./predefined-commands";

describe("predefined autoexec commands", () => {
  it("does not ship duplicate command keys", () => {
    const commandKeys = FLAT_AUTOEXEC_COMMANDS.map(
      (command) => command.command,
    );
    const uniqueCommandKeys = new Set(commandKeys);

    expect(uniqueCommandKeys.size).toBe(commandKeys.length);
  });

  it("does not include stale region override entries", () => {
    expect(
      FLAT_AUTOEXEC_COMMANDS.some(
        (command) => command.command === "citadel_region_override",
      ),
    ).toBe(false);
  });

  it("does not keep the removed region override category id", () => {
    const categoryIds: string[] = AUTOEXEC_CATEGORIES.map(
      (category) => category.id,
    );

    expect(categoryIds.includes("matchmakingRegion")).toBe(false);
  });

  it("does not include obsolete or command-only entries as convars", () => {
    const removedCommands = new Set([
      "battery_saver",
      "citadel_render_minimap",
    ]);

    expect(
      FLAT_AUTOEXEC_COMMANDS.some((command) =>
        removedCommands.has(command.command),
      ),
    ).toBe(false);
  });
});
