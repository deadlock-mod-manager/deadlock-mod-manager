import { describe, expect, it } from "bun:test";
import {
  entriesContainConfigFile,
  hasConfigHistory,
  shouldTreatInstallAsConfig,
  stripStoredModPrefix,
} from "@/lib/mods/config-state";

describe("config mod state helpers", () => {
  it("keeps disabled config mods identified from config history", () => {
    expect(
      hasConfigHistory({
        currentConfigFiles: [],
        disabledConfigFiles: ["autoexec.cfg"],
        originalConfigFilePaths: [],
      }),
    ).toBe(true);
  });

  it("uses config files even when a file tree without config entries exists", () => {
    expect(
      shouldTreatInstallAsConfig(
        { isConfig: false },
        {
          files: [
            {
              name: "pak01_dir.vpk",
              path: "pak01_dir.vpk",
              size: 10,
              is_selected: true,
              archive_name: "mod.zip",
              kind: "vpk",
            },
          ],
          total_files: 1,
          has_multiple_files: false,
        },
        ["autoexec.cfg"],
      ),
    ).toBe(true);
  });

  it("strips stored mod prefixes without treating remote ids as regex", () => {
    expect(stripStoredModPrefix("abc.123_autoexec.cfg", "abc.123")).toBe(
      "autoexec.cfg",
    );
    expect(stripStoredModPrefix("abcX123_autoexec.cfg", "abc.123")).toBe(
      "abcX123_autoexec.cfg",
    );
  });

  it("detects config files in nested directory entries", () => {
    expect(
      entriesContainConfigFile([
        {
          name: "cfg",
          children: [{ name: "subdir", children: [{ name: "autoexec.cfg" }] }],
        },
      ]),
    ).toBe(true);
  });
});
