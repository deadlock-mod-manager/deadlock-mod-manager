import type { ResourceKey } from "i18next";

export default import.meta.glob<ResourceKey>("../../../locales/pl-PL/*.json", {
  eager: true,
  import: "default",
});
