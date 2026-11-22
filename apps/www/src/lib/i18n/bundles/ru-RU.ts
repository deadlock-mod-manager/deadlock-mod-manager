import type { ResourceKey } from "i18next";

/** All ru-RU namespaces in one lazily loaded chunk. */
export default import.meta.glob<ResourceKey>("../../../locales/ru-RU/*.json", {
  eager: true,
  import: "default",
});
