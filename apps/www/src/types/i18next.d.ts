import type common from "@/locales/en/common.json";
import type download from "@/locales/en/download.json";
import type errorDownload from "@/locales/en/error-download.json";
import type errorFatal from "@/locales/en/error-fatal.json";
import type errorModOrder from "@/locales/en/error-mod-order.json";
import type errorOs5 from "@/locales/en/error-os-5.json";
import type errorOs740 from "@/locales/en/error-os-740.json";
import type guideGrimoire from "@/locales/en/guide-grimoire.json";
import type guideInstall from "@/locales/en/guide-install.json";
import type guideMods from "@/locales/en/guide-mods.json";
import type guideNotWorking from "@/locales/en/guide-not-working.json";
import type guideSkins from "@/locales/en/guide-skins.json";
import type home from "@/locales/en/home.json";
import type preview from "@/locales/en/preview.json";
import type toolCrosshair from "@/locales/en/tool-crosshair.json";
import type toolKv from "@/locales/en/tool-kv.json";
import type toolRandomizer from "@/locales/en/tool-randomizer.json";
import type toolVpk from "@/locales/en/tool-vpk.json";

/** English files are the source of truth for translation keys. */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      home: typeof home;
      preview: typeof preview;
      download: typeof download;
      "tool-randomizer": typeof toolRandomizer;
      "tool-crosshair": typeof toolCrosshair;
      "tool-vpk": typeof toolVpk;
      "tool-kv": typeof toolKv;
      "guide-mods": typeof guideMods;
      "guide-skins": typeof guideSkins;
      "guide-install": typeof guideInstall;
      "guide-not-working": typeof guideNotWorking;
      "guide-grimoire": typeof guideGrimoire;
      "error-os-5": typeof errorOs5;
      "error-os-740": typeof errorOs740;
      "error-mod-order": typeof errorModOrder;
      "error-download": typeof errorDownload;
      "error-fatal": typeof errorFatal;
    };
    returnNull: false;
  }
}
