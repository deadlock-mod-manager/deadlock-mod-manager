import type { ResourceKey } from "i18next";

/** All pt-BR namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/pt-BR/*.json", {
  eager: true,
  import: "default",
});
