import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/es-ES/*.json", {
  eager: true,
  import: "default",
});
