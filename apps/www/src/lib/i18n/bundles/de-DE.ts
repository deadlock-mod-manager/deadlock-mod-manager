import type { ResourceKey } from "i18next";

/** All de-DE namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/de-DE/*.json", {
  eager: true,
  import: "default",
});
