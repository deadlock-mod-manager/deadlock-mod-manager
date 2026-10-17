import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  AppUpdateError,
  checkForAppUpdates,
  installAppUpdate,
  type UpdateCheckResponse,
  type UpdateContext,
} from "./app-updates";

const context: UpdateContext = {
  channel: "nightly",
  runtime: "cef",
  installer: "deb",
  target: "linux-x86_64-deb",
};

const available: UpdateCheckResponse = {
  context,
  status: "available",
  metadata: {
    rid: 1,
    version: "2.1.0",
    currentVersion: "2.0.0",
    rawJson: {},
  },
};

describe("app update outcomes", () => {
  for (const message of ["HTTP 404", "invalid manifest JSON"]) {
    it(`rejects ${message} instead of resolving to no update`, async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const fetch = queryClient.fetchQuery({
        queryKey: ["app-updates", "native"],
        queryFn: () =>
          checkForAppUpdates(async () => ({
            context,
            status: "check-failed",
            message,
          })),
      });
      await expect(fetch).rejects.toBeInstanceOf(AppUpdateError);
      await expect(fetch).rejects.toMatchObject({
        phase: "check-failed",
        reason: message,
        context,
      });
      expect(queryClient.getQueryState(["app-updates", "native"])?.status).toBe(
        "error",
      );
      expect(
        queryClient.getQueryData(["app-updates", "native"]),
      ).toBeUndefined();
    });
  }

  it("distinguishes a missing exact target from a failed check", async () => {
    await expect(
      checkForAppUpdates(async () => ({
        context,
        status: "missing-target",
        message: "linux-x86_64-deb is missing",
      })),
    ).rejects.toMatchObject({ phase: "missing-target", context });
  });

  it("returns no update only for a successful no-update response", async () => {
    expect(
      await checkForAppUpdates(async () => ({ context, status: "no-update" })),
    ).toBeNull();
  });

  it("retains the native update resource and installation context", async () => {
    const update = await checkForAppUpdates(async () => available);
    expect(update?.rid).toBe(1);
    expect(update?.version).toBe("2.1.0");
    expect(update?.context).toEqual(context);
  });

  it("distinguishes an installation failure and retains its target", async () => {
    const update = await checkForAppUpdates(async () => available);
    if (!update) throw new Error("Expected an update fixture");
    await expect(
      installAppUpdate(update, undefined, async () => {
        throw new Error("Signature verification failed");
      }),
    ).rejects.toMatchObject({
      phase: "install-failed",
      context,
      reason: "Signature verification failed",
    });
  });

  it("preserves an IPC failure as a failed check", async () => {
    await expect(
      checkForAppUpdates(async () => {
        throw "IPC disconnected";
      }),
    ).rejects.toMatchObject({
      phase: "check-failed",
      reason: "IPC disconnected",
    });
  });
});
