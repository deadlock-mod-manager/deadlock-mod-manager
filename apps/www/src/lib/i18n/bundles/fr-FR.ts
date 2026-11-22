import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/fr-FR/*.json", {
  eager: true,
  import: "default",
});
