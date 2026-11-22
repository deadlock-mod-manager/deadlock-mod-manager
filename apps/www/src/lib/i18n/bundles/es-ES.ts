import type { ResourceKey } from "i18next";

/** All es-ES namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/es-ES/*.json", {
  eager: true,
  import: "default",
});
