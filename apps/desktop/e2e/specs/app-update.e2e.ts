import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { UPDATE_PATH, UPDATE_VERSION } from "../support/app-update-fixtures";
import type { UpdateCheckResponse } from "../../src/lib/app-updates";

describe("application updater", () => {
  it("uses the advertised nightly asset and reports check/install failures", async () => {
    const application = await startApplication();
    if (process.env.DMM_E2E_CASE_ID === "app-update-check-failure") {
      const check = await $("button=Check for Updates");
      await check.waitForClickable();
      await check.click();
      await expect($("p=Could not check for updates")).toBeDisplayed();
      await expect($("button=Install update")).not.toExist();
      await expect($("div=You have the latest version.")).not.toExist();
    } else {
      const install = await $("button=Install update");
      await install.waitForClickable();
      const response = await browser.execute(() =>
        window["__TAURI_INTERNALS__"].invoke<UpdateCheckResponse>(
          "check_app_update",
        ),
      );
      if (response.status !== "available")
        throw new Error("Expected nightly fixture update");
      expect(response.metadata.version).toBe(UPDATE_VERSION);
      expect(response.metadata.downloadUrl).toContain(UPDATE_PATH);
      await browser.execute(
        (rid: number) =>
          window["__TAURI_INTERNALS__"].invoke<void>("plugin:resources|close", {
            rid,
          }),
        response.metadata.rid,
      );
      await install.click();
      // An unsigned fixture must download but never install onto the test host.
      await expect($("p=Could not install the update")).toBeDisplayed();
      await expect(install).toBeEnabled();
    }
    await closeApplication(application.roots.world, application.processId);
  });
});
