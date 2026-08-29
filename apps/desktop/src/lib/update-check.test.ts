import { describe, expect, it } from "bun:test";
import { ProviderError } from "@deadlock-mods/common";
import {
  buildExactUpdateCheckOptions,
  checkExactUpdate,
  installExactUpdate,
} from "./update-check";

describe("exact updater policy", () => {
  it("never enables updater downgrades", () => {
    expect(buildExactUpdateCheckOptions("windows-x86_64-nsis")).toEqual({
      target: "windows-x86_64-nsis",
      allowDowngrades: false,
    });
  });
});

describe("checkExactUpdate", () => {
  it("distinguishes a successful check with no newer version", async () => {
    const outcome = await checkExactUpdate(
      "linux-x86_64-deb",
      async () => null,
    );

    expect(outcome).toEqual({ kind: "noUpdate" });
  });

  it("returns an available update from the exact target", async () => {
    const update = { version: "1.2.0" };
    const outcome = await checkExactUpdate(
      "windows-x86_64-nsis",
      async () => update,
    );

    expect(outcome).toEqual({ kind: "available", update });
  });

  it("represents a missing exact target separately", async () => {
    const outcome = await checkExactUpdate("linux-x86_64-rpm", async () => {
      throw new Error(
        "the platform `linux-x86_64-rpm` was not found in the response platforms object",
      );
    });

    expect(outcome).toEqual({
      kind: "targetUnavailable",
      message:
        "the platform `linux-x86_64-rpm` was not found in the response platforms object",
    });
  });

  it("rejects HTTP and invalid-manifest failures instead of returning no update", async () => {
    const result = checkExactUpdate("linux-x86_64-deb", async () => {
      throw new Error("Could not fetch a valid release JSON from the remote");
    });

    await expect(result).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects invalid manifest data instead of returning no update", async () => {
    const result = checkExactUpdate("linux-x86_64-deb", async () => {
      throw new Error("missing field `platforms`");
    });

    await expect(result).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("installExactUpdate", () => {
  it("preserves installation failure as a distinct provider error", async () => {
    const result = installExactUpdate(async () => {
      throw new Error("installer exited with code 1");
    });

    await expect(result).rejects.toBeInstanceOf(ProviderError);
    await expect(result).rejects.toThrow("Update installation failed");
  });
});
