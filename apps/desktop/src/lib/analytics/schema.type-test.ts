import type { AnalyticsClient } from "./client";

// Compiled by tsconfig.analytics-tests.json; deliberately never executed.
export const checkAnalyticsContracts = (analytics: AnalyticsClient) => {
  analytics.track("first_install_completed");
  analytics.track("page_viewed", { page: "dashboard" });
  analytics
    .start("crosshair_apply", { entry_point: "editor" })
    .finish("completed");
  // @ts-expect-error Unknown events cannot silently enter the reporting schema.
  analytics.track("mod_instaled", {});
  // @ts-expect-error Required event properties cannot be omitted.
  analytics.track("page_viewed");
  analytics.track("page_viewed", {
    page: "browse-mods",
    // @ts-expect-error Raw search text is not part of the event contract.
    search: "private text",
  });
  // @ts-expect-error Runtime metadata is owned by the adapter.
  analytics.track("page_viewed", { page: "dashboard", app_version: "stale" });
  // @ts-expect-error Entry points are specific to each operation.
  analytics.start("crosshair_apply", { entry_point: "featured" });
  // @ts-expect-error Update attempts require a target version.
  analytics.start("app_update", { entry_point: "update_button" });
  analytics
    .start("game_launch", { launch_mode: "modded" })
    .finish("completed", {
      // @ts-expect-error Result payloads belong to their originating operation.
      vpk_count: 2,
    });
  analytics
    .start("crosshair_apply", { entry_point: "library" })
    .finish("completed", {
      // @ts-expect-error Operations without result metrics reject arbitrary fields.
      anything: true,
    });
};
