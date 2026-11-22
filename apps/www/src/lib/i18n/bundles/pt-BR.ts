import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/pt-BR/*.json", {
  eager: true,
  import: "default",
});
