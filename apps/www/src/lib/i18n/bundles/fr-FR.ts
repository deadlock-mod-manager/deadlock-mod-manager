import type { ResourceKey } from "i18next";

/** All fr-FR namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/fr-FR/*.json", {
  eager: true,
  import: "default",
});
