export const GUIDES = [
  {
    key: "mods",
    path: "/mods",
  },
  {
    key: "skins",
    path: "/skins",
  },
  {
    key: "install",
    path: "/how-to-install-deadlock-mods",
  },
  {
    key: "notWorking",
    path: "/deadlock-mods-not-working",
  },
  {
    key: "grimoire",
    path: "/compare/grimoire",
  },
] as const;

export const ERROR_GUIDES = [
  {
    key: "os5",
    path: "/deadlock-mod-manager-os-error-5",
  },
  {
    key: "os740",
    path: "/deadlock-mod-manager-os-error-740",
  },
  {
    key: "modOrder",
    path: "/deadlock-mod-manager-failed-to-save-mod-order",
  },
  {
    key: "download",
    path: "/deadlock-mod-manager-failed-to-download",
  },
  {
    key: "fatal",
    path: "/deadlock-fatal-error-unable-to-load-layout-file",
  },
] as const;

export type Guide = (typeof GUIDES)[number] | (typeof ERROR_GUIDES)[number];

export type GuidePath = Guide["path"];

export const TROUBLESHOOTING_GUIDES: readonly Guide[] = [
  GUIDES[3],
  ...ERROR_GUIDES,
];
