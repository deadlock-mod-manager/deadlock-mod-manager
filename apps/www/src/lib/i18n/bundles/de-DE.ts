import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/de-DE/*.json", {
  eager: true,
  import: "default",
});
