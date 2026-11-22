import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/ru-RU/*.json", {
  eager: true,
  import: "default",
});
