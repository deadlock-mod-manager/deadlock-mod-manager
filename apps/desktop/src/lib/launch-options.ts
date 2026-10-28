import { CustomSettingType } from "@deadlock-mods/shared";
import { getCustomSettings } from "@/lib/api-client";
import { queryClient } from "@/lib/client";
import { LIVE_BRIDGE_LINK } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import type { LocalSetting } from "@/types/settings";

const LOCAL_SETTING_PREFIX = "local_setting_";

// Server launch options are stored under their database id. Once the server
// deletes or re-creates one, the stored copy keeps applying at launch while the
// settings page no longer lists it, so nothing can turn it off.
const findOrphanedLaunchOptionIds = (
  settings: LocalSetting[],
  serverSettingIds: ReadonlySet<string>,
): string[] =>
  settings
    .filter(
      (s) =>
        s.type === CustomSettingType.LAUNCH_OPTION &&
        !s.id.startsWith(LOCAL_SETTING_PREFIX) &&
        !serverSettingIds.has(s.id),
    )
    .map((s) => s.id);

const pruneOrphanedLaunchOptions = async () => {
  const serverSettings = await queryClient
    .fetchQuery({
      queryKey: ["custom-settings"],
      queryFn: getCustomSettings,
      retry: false,
      meta: { skipGlobalErrorHandler: true },
    })
    .catch(() => null);
  // Offline: an orphan can't be told apart from a live option, so keep both.
  if (!serverSettings) return;

  const { settings, removeSetting } = usePersistedStore.getState();
  const orphanedIds = findOrphanedLaunchOptionIds(
    Object.values(settings),
    new Set(serverSettings.map((s) => s.id)),
  );
  for (const id of orphanedIds) {
    removeSetting(id);
  }
};

export const getAdditionalArgs = async () => {
  await pruneOrphanedLaunchOptions();
  const { settings, gamePresenceEnabled, localMods } =
    usePersistedStore.getState();
  const additionalArgs: string[] = [];
  // The live bridge reports through the console log, which only -condebug writes.
  const liveBridgeInstalled = localMods.some(
    (mod) => mod.remoteUrl === LIVE_BRIDGE_LINK,
  );

  if (gamePresenceEnabled || liveBridgeInstalled) {
    additionalArgs.push("-condebug");
  }

  for (const setting of Object.values(settings).filter(
    (s) => s.type === CustomSettingType.LAUNCH_OPTION && s.enabled,
  )) {
    additionalArgs.push(`${setting.key} ${setting.value || ""}`.trim());
  }

  return additionalArgs.join(" ");
};
