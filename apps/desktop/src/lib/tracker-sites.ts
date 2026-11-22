// Mirrors deadlock-api's own list (website/src/lib/tracker-sites.ts in
// deadlock-api/deadlock-api), minus this app. Only sponsors carry a link there,
// so only they do here. Icons are copies of deadlock-api.com/tracker-sites,
// bundled so the Match Data tab makes no requests.
const ICON_BASE = "/tracker-sites";

export type TrackerSite = {
  name: string;
  icon: string;
  href?: string;
};

export const TRACKER_SITES: readonly TrackerSite[] = [
  {
    name: "DeadChaps",
    icon: `${ICON_BASE}/deadchaps.webp`,
    href: "https://www.deadchaps.gg/",
  },
  {
    name: "Statlocker",
    icon: `${ICON_BASE}/statlocker.webp`,
    href: "https://statlocker.gg/",
  },
  {
    name: "Buildlock",
    icon: `${ICON_BASE}/buildlock.svg`,
    href: "https://buildlock.net/",
  },
  {
    name: "DLTV",
    icon: `${ICON_BASE}/dltv.webp`,
    href: "https://dltv.gg/",
  },
  { name: "EDL", icon: `${ICON_BASE}/edl.webp`, href: "https://edl.gg" },
  { name: "Tracklock", icon: `${ICON_BASE}/tracklock.webp` },
  { name: "LockBlaze", icon: `${ICON_BASE}/lockblaze.webp` },
  { name: "Tracker.gg", icon: `${ICON_BASE}/tracker-gg.webp` },
  { name: "Mobalytics", icon: `${ICON_BASE}/mobalytics.webp` },
  { name: "Blitz", icon: `${ICON_BASE}/blitz.webp` },
  { name: "Lockbuilds", icon: `${ICON_BASE}/lockbuilds.webp` },
  { name: "Deadlock Academy", icon: `${ICON_BASE}/deadlock-academy.webp` },
  {
    name: "Soulcounter",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230a0d0f'/%3E%3Cpath d='M16 5l9 5v12l-9 5-9-5V10z' fill='none' stroke='%23d4ae62' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='3.5' fill='%23d4ae62'/%3E%3C/svg%3E",
  },
  { name: "VP Esports", icon: `${ICON_BASE}/vp-esports.webp` },
  { name: "Deadlock Labs", icon: `${ICON_BASE}/deadlock-labs.webp` },
  { name: "Soultracker", icon: `${ICON_BASE}/soultracker.webp` },
  { name: "Rankalytics", icon: `${ICON_BASE}/rankalytics.webp` },
  { name: "LockTV", icon: `${ICON_BASE}/locktv.webp` },
  { name: "LockCodex", icon: `${ICON_BASE}/lockcodex.webp` },
  { name: "Deadlock Builds", icon: `${ICON_BASE}/deadlock-builds.webp` },
  { name: "Urnlock", icon: `${ICON_BASE}/urnlock.webp` },
  { name: "DeadUnlock", icon: `${ICON_BASE}/deadunlock.svg` },
  { name: "LiveLock", icon: `${ICON_BASE}/livelock.webp` },
  { name: "Statlocked", icon: `${ICON_BASE}/statlocked.webp` },
  { name: "DTV", icon: `${ICON_BASE}/dtv.webp` },
  { name: "Chudlock", icon: `${ICON_BASE}/chudlock.svg` },
  { name: "ScrimCache", icon: `${ICON_BASE}/scrimcache.webp` },
  { name: "The Cursed Apple", icon: `${ICON_BASE}/the-cursed-apple.svg` },
  { name: "Deadlock+", icon: `${ICON_BASE}/deadlock.webp` },
  { name: "Tierspire", icon: `${ICON_BASE}/tierspire.webp` },
  { name: "Deadlock Brasil", icon: `${ICON_BASE}/deadlock-brasil.webp` },
  { name: "SoulScope", icon: `${ICON_BASE}/soulscope.svg` },
  { name: "DeadStats", icon: `${ICON_BASE}/deadstats.webp` },
  { name: "Deadlock Sensei", icon: `${ICON_BASE}/deadlock-sensei.webp` },
  { name: "Deadlock Meta", icon: `${ICON_BASE}/deadlock-meta.webp` },
  { name: "DraftMeta", icon: `${ICON_BASE}/draftmeta.webp` },
  { name: "Buildlock.io", icon: `${ICON_BASE}/buildlock-io.webp` },
  { name: "Deadlock Vault", icon: `${ICON_BASE}/deadlock-vault.svg` },
  { name: "DenyPick", icon: `${ICON_BASE}/denypick.webp` },
  {
    name: "Deadlock Update Tracker",
    icon: `${ICON_BASE}/deadlock-update-tracker.webp`,
  },
  { name: "MetaBot.GG", icon: `${ICON_BASE}/metabot.webp` },
  { name: "Deadlockub", icon: `${ICON_BASE}/deadlockub.webp` },
  { name: "Deadlocker", icon: `${ICON_BASE}/deadlocker-net.webp` },
];
