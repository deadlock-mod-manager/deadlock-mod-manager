import { describe, expect, it } from "bun:test";
import { ModStatus } from "@/types/mods";
import { ModStatusStateMachine } from "./mod-status";

const allows = (from: ModStatus, to: ModStatus) =>
  ModStatusStateMachine.validateTransition(from, to).isOk();

describe("ModStatusStateMachine", () => {
  it("lets a failed download be retried", () => {
    expect(allows(ModStatus.FailedToDownload, ModStatus.Downloading)).toBe(
      true,
    );
  });

  it("lets a retried download report progress and completion", () => {
    expect(allows(ModStatus.FailedToDownload, ModStatus.Extracting)).toBe(true);
    expect(allows(ModStatus.FailedToDownload, ModStatus.Downloaded)).toBe(true);
  });

  it("keeps a failed download recoverable the same way a failed install is", () => {
    expect(allows(ModStatus.FailedToInstall, ModStatus.Downloaded)).toBe(true);
    expect(allows(ModStatus.FailedToDownload, ModStatus.Downloaded)).toBe(true);
  });

  it("rejects transitions that skip the download", () => {
    expect(allows(ModStatus.FailedToDownload, ModStatus.Installed)).toBe(false);
    expect(allows(ModStatus.FailedToDownload, ModStatus.Removing)).toBe(false);
  });

  it("treats a no-op transition as valid", () => {
    expect(allows(ModStatus.FailedToDownload, ModStatus.FailedToDownload)).toBe(
      true,
    );
  });
});
