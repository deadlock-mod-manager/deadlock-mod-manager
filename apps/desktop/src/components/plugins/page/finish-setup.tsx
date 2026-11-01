import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  FileIcon,
  FileZipIcon,
  FolderOpenIcon,
  FolderSimpleIcon,
  PowerIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AskCard } from "@/components/plugins/page/ask-card";
import {
  allowsDefaultProfile,
  chooseGrantedPath,
  type FilesRequest,
  findPermission,
  permissionNeeds,
  sortPermissions,
  usePermissionCopy,
} from "@/components/plugins/plugin-permissions";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { getErrorMessage } from "@/lib/errors";
import {
  DEFAULT_PROFILE_FOLDER,
  EXTERNAL_PLUGINS_QUERY_KEY,
  grantExternalPlugin,
  setExternalPluginEnabled,
} from "@/lib/external-plugins";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ExternalPluginPermission } from "@/types/generated/ExternalPluginPermission";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { ProfileSelect } from "./profile-select";
import { usePluginActions } from "./use-plugin-actions";

/** Before a plugin first runs: pick what it asked for, then turn it on. */
export const FinishSetup = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const describe = usePermissionCopy();
  const { confirmRemove, busy: actionBusy } = usePluginActions(plugin);
  const profiles = usePersistedStore((state) => state.profiles);
  const createProfile = usePersistedStore((state) => state.createProfile);
  const allProfiles = Object.values(profiles);
  const testProfiles = allProfiles.filter(
    (profile) => !profile.isDefault && profile.folderName,
  );
  const defaultProfile = allProfiles.find((profile) => profile.isDefault);

  const requests = sortPermissions(plugin.requiredPermissions);
  const filesRequest = findPermission(requests, "files");
  const modsRequest = findPermission(requests, "mods");
  const online = Boolean(findPermission(requests, "network"));

  const [filePath, setFilePath] = useState(() => {
    const granted = plugin.grant?.file;
    return granted && granted.kind === filesRequest?.kind ? granted.path : null;
  });
  const [profileFolder, setProfileFolder] = useState(() => {
    const granted = plugin.grant?.profileFolder ?? null;
    if (granted === DEFAULT_PROFILE_FOLDER) {
      return modsRequest && allowsDefaultProfile(modsRequest) ? granted : null;
    }
    return testProfiles.some((profile) => profile.folderName === granted)
      ? granted
      : null;
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const isReady = (permission: ExternalPluginPermission) => {
    const needs = permissionNeeds(permission);
    if (needs === "profile") return profileFolder !== null;
    if (needs) return filePath !== null;
    return true;
  };
  const stepsLeft = requests.filter((request) => !isReady(request)).length;
  const activeId = profileMenuOpen
    ? "mods"
    : requests.find((request) => !isReady(request))?.id;
  const testProfileName = t("plugins.page.setup.testProfileName", {
    name: plugin.name,
  });

  const reportFailure = (titleKey: string) => (error: Error) => {
    logger.errorOnly(error);
    toast.error(t(titleKey), { description: getErrorMessage(error) });
  };

  const browse = useMutation({
    mutationFn: (request: FilesRequest) =>
      chooseGrantedPath(t, request, plugin.name),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (selected) => {
      if (selected) setFilePath(selected);
    },
  });

  const createTestProfile = useMutation({
    mutationFn: async () => {
      const profileId = await createProfile(testProfileName);
      const folder = profileId
        ? usePersistedStore.getState().profiles[profileId]?.folderName
        : null;
      if (!folder) throw new Error(t("plugins.page.setup.createFailed"));
      return folder;
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (folder) => {
      setProfileFolder(folder);
      setProfileMenuOpen(false);
    },
    onError: reportFailure("plugins.page.setup.createFailed"),
  });

  const enable = useMutation({
    mutationFn: async () => {
      await grantExternalPlugin({
        pluginId: plugin.id,
        expectedHash: plugin.packageHash,
        filePath: filesRequest ? filePath : null,
        profileFolder:
          modsRequest?.profiles === "picked" ? profileFolder : null,
      });
      await setExternalPluginEnabled(plugin.id, true);
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () =>
      toast.success(t("plugins.page.setup.enabled", { name: plugin.name })),
    onError: reportFailure("plugins.page.setup.enableFailed"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY }),
  });

  const fieldFor = (permission: ExternalPluginPermission) => {
    if (permission.id === "files") {
      const folder = permission.kind === "folder";
      const PathIcon = folder ? FolderSimpleIcon : FileIcon;
      return (
        <div className='flex w-full items-center gap-2'>
          <div className='flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[8px] bg-background px-2.5 ring-1 ring-border ring-inset'>
            <PathIcon className='shrink-0 text-muted-foreground' size={14} />
            <span
              className={cn(
                "truncate font-mono text-[12px] leading-[normal]",
                filePath ? "text-foreground" : "text-muted-foreground",
              )}
              title={filePath ?? undefined}>
              {filePath ??
                t(
                  folder
                    ? "plugins.page.setup.noFolder"
                    : "plugins.page.setup.noFile",
                )}
            </span>
          </div>
          <PageButton
            className='px-3 py-1.5 text-[13px]'
            disabled={browse.isPending}
            onClick={() => browse.mutate(permission)}
            variant='outline'>
            <FolderOpenIcon />
            {t("plugins.page.setup.browse")}
          </PageButton>
        </div>
      );
    }
    if (permission.id === "mods" && permission.profiles === "picked") {
      return (
        <ProfileSelect
          creating={createTestProfile.isPending}
          defaultProfile={defaultProfile}
          install={!allowsDefaultProfile(permission)}
          onCreate={() => createTestProfile.mutate()}
          onOpenChange={setProfileMenuOpen}
          onSelect={(folder) => {
            setProfileFolder(folder);
            setProfileMenuOpen(false);
          }}
          open={profileMenuOpen}
          profiles={testProfiles}
          selectedFolder={profileFolder}
          testProfileName={testProfileName}
        />
      );
    }
    return null;
  };

  return (
    <div className='flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pt-7 pb-6'>
      <div className='flex h-fit w-[720px] max-w-full flex-col gap-[14px]'>
        <div className='flex flex-col gap-1.5 pb-1 leading-[normal]'>
          <h2 className='font-semibold text-[22px]/[29px] text-foreground'>
            {t("plugins.page.setup.title", { name: plugin.name })}
          </h2>
          <p className='text-[13px] text-muted-foreground'>
            {t("plugins.page.setup.subtitle")}
          </p>
        </div>
        {plugin.source === "file" ? (
          <div className='flex items-center gap-2.5 rounded-[10px] bg-[#FBBF2412] px-3 py-2.5 ring-1 ring-[#FBBF2433] ring-inset'>
            <FileZipIcon
              className='shrink-0'
              color={TONE_COLOR.warn}
              size={16}
            />
            <p className='flex-1 text-[12px] text-foreground leading-[17px]'>
              {t("plugins.page.setup.fromFile")}
            </p>
          </div>
        ) : null}
        <h3 className='font-bold text-[#7C756E] text-[10px] uppercase leading-[normal] tracking-[1.1px]'>
          {t("plugins.page.setup.label")}
        </h3>
        {requests.map((request) => (
          <AskCard
            active={activeId === request.id}
            copy={describe(request)}
            key={request.id}
            ready={isReady(request)}
            tight={request.id === "mods" && profileMenuOpen}>
            {fieldFor(request)}
          </AskCard>
        ))}
        <p className='flex items-center gap-2 px-0.5 pt-1.5 text-[12px] text-muted-foreground leading-[normal]'>
          <ShieldCheckIcon
            className='shrink-0'
            color={TONE_COLOR.ok}
            size={14}
          />
          {t(
            online
              ? "plugins.page.setup.neverOnline"
              : "plugins.page.setup.neverOffline",
          )}
        </p>
        <div className='flex items-center gap-2.5 pt-2.5'>
          <PageButton
            disabled={actionBusy || enable.isPending}
            onClick={() => void confirmRemove()}
            variant='ghost'>
            <TrashIcon />
            {t("plugins.page.remove.action")}
          </PageButton>
          <span className='h-px flex-1' />
          {stepsLeft > 0 ? (
            <span className='text-[#FBBF24] text-[12px] leading-[normal]'>
              {t("plugins.page.setup.stepsLeft", { count: stepsLeft })}
            </span>
          ) : null}
          <PageButton
            disabled={stepsLeft > 0 || enable.isPending || actionBusy}
            onClick={() => enable.mutate()}
            variant='primary'>
            <PowerIcon />
            {t("plugins.page.setup.enable")}
          </PageButton>
        </div>
      </div>
    </div>
  );
};
