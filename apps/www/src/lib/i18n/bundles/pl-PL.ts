import type { ResourceKey } from "i18next";

/** All pl-PL namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/pl-PL/*.json", {
  eager: true,
  import: "default",
});
