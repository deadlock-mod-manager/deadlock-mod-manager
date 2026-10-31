import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import type { Icon } from "@phosphor-icons/react";
import {
  BellIcon,
  EraserIcon,
  EyeIcon,
  FileIcon,
  FolderOpenIcon,
  FolderSimpleIcon,
  GameControllerIcon,
  GlobeIcon,
  HardDriveIcon,
  KeyIcon,
  UserCircleIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { forwardRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { formatPluginSize } from "@/components/plugins/plugin-format";
import {
  allowsDefaultProfile,
  chooseGrantedPath,
  type FilesRequest,
  isPermissionGranted,
  type ModsRequest,
  type PermissionCopy,
  permissionTokens,
  sortPermissions,
  usePermissionCopy,
} from "@/components/plugins/plugin-permissions";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const PATH_SEPARATOR = /[\\/]/;

/** `C:\Users\me\Downloads\out.vpk` → `Downloads\out.vpk`, keeping the path's own separator. */
const shortPath = (path: string) => {
  const separator = path.includes("\\") ? "\\" : "/";
  return path.split(PATH_SEPARATOR).filter(Boolean).slice(-2).join(separator);
};

/** Requests the plugin needs to run, and how many of them the current grant covers. */
export const grantProgress = (plugin: ExternalPluginSummary) => {
  const done = plugin.requiredPermissions.filter((permission) =>
    isPermissionGranted(plugin.grant, permission),
  ).length;
  return { done, total: plugin.requiredPermissions.length };
};

type CardActionProps = {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

const CardAction = forwardRef<HTMLButtonElement, CardActionProps>(
  ({ icon: ActionIcon, label, onClick, disabled, ...props }, ref) => (
    <button
      className='flex shrink-0 items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[#A3A3A3] text-[13px] leading-[normal] transition-colors hover:bg-[#FFFFFF0A] hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
      disabled={disabled}
      onClick={onClick}
      ref={ref}
      type='button'
      {...props}>
      <ActionIcon color='currentColor' size={16} />
      {label}
    </button>
  ),
);
CardAction.displayName = "CardAction";

type GrantCardProps = {
  copy: PermissionCopy;
  tokens: string[];
  action: ReactNode;
  scopeIcon: Icon;
  scope: string;
  scopeMono?: boolean;
};

const GrantCard = ({
  copy,
  tokens,
  action,
  scopeIcon: ScopeIcon,
  scope,
  scopeMono,
}: GrantCardProps) => {
  const PermissionIcon = copy.icon;
  return (
    <div className='flex w-full flex-col gap-[10px] rounded-[10px] bg-background px-[14px] py-[12px] outline outline-1 -outline-offset-1 outline-[#FFFFFF0F]'>
      <div className='flex w-full items-center gap-[10px]'>
        <span className='flex size-[28px] shrink-0 items-center justify-center rounded-[7px] bg-[#FFFFFF0A]'>
          <PermissionIcon color='#EFE0BE' size={15} />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
          <span className='font-semibold text-[13px] text-foreground leading-[normal]'>
            {copy.title}
          </span>
          <span className='overflow-hidden text-ellipsis whitespace-pre font-mono text-[#7C756E] text-[10px] leading-[normal]'>
            {tokens.join("  ")}
          </span>
        </div>
        {action}
      </div>
      <div className='flex w-full items-center gap-[8px] rounded-[7px] bg-[#FFFFFF05] px-[10px] py-[7px]'>
        <ScopeIcon className='shrink-0' color='#A3A3A3' size={14} />
        <span
          className={cn(
            "min-w-0 truncate text-[12px] text-foreground leading-[normal]",
            scopeMono && "font-mono",
          )}>
          {scope}
        </span>
        <span className='h-px flex-1' />
        <span className='shrink-0 text-[#A3A3A3] text-[11px] leading-[normal]'>
          {copy.note}
        </span>
      </div>
    </div>
  );
};

type PermissionGrantCardsProps = {
  plugin: ExternalPluginSummary;
  /** Called before leaving for the plugin's setup page, e.g. to close a sheet. */
  onNavigate?: () => void;
};

/** One card per request the plugin needs, with the value granted and a way to change it. */
export const PermissionGrantCards = ({
  plugin,
  onNavigate,
}: PermissionGrantCardsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const describe = usePermissionCopy();
  const { testProfiles, defaultProfile, profileName } = usePluginProfiles();
  const { grant, clearData, confirmClearData } = usePluginActions(plugin);
  const current = plugin.grant;
  const notChosen = t("plugins.access.actions.notChosen");

  const setUp = (
    <CardAction
      icon={KeyIcon}
      label={t("plugins.access.actions.setUp")}
      onClick={() => {
        onNavigate?.();
        navigate(`/ext/${encodeURIComponent(plugin.id)}`);
      }}
    />
  );

  const changeFile = useMutation({
    mutationFn: (request: FilesRequest) =>
      chooseGrantedPath(t, request, plugin.name),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (filePath) => {
      if (filePath && current) {
        grant.mutate({ filePath, profileFolder: current.profileFolder });
      }
    },
  });

  const filesCard = (request: FilesRequest, copy: PermissionCopy) => {
    const folder = request.kind === "folder";
    const file = current?.file?.kind === request.kind ? current.file : null;
    return (
      <GrantCard
        action={
          current ? (
            <CardAction
              disabled={grant.isPending || changeFile.isPending}
              icon={FolderOpenIcon}
              label={t(
                folder
                  ? "plugins.access.actions.changeFolder"
                  : "plugins.access.actions.changeFile",
              )}
              onClick={() => changeFile.mutate(request)}
            />
          ) : (
            setUp
          )
        }
        copy={copy}
        key={request.id}
        scope={file ? shortPath(file.path) : notChosen}
        scopeIcon={folder ? FolderSimpleIcon : FileIcon}
        scopeMono={Boolean(file)}
        tokens={permissionTokens(request)}
      />
    );
  };

  const modsCard = (request: ModsRequest, copy: PermissionCopy) => {
    if (request.profiles === "all") {
      return (
        <GrantCard
          action={null}
          copy={copy}
          key={request.id}
          scope={t("plugins.permissions.mods.allProfiles")}
          scopeIcon={UserCircleIcon}
          tokens={permissionTokens(request)}
        />
      );
    }
    const choices =
      defaultProfile && allowsDefaultProfile(request)
        ? [defaultProfile, ...testProfiles]
        : testProfiles;
    const profileFolder = current?.profileFolder ?? null;
    return (
      <GrantCard
        action={
          current ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <CardAction
                  disabled={grant.isPending}
                  icon={UserSwitchIcon}
                  label={t("plugins.access.actions.changeProfile")}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='min-w-[200px]'>
                {choices.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {t("plugins.access.actions.noTestProfiles")}
                  </DropdownMenuItem>
                ) : (
                  choices.map((profile) => (
                    <DropdownMenuItem
                      disabled={profile.folderName === profileFolder}
                      key={profile.id}
                      onSelect={() =>
                        grant.mutate({
                          filePath: current.file?.path ?? null,
                          profileFolder: profile.folderName,
                        })
                      }>
                      <UserCircleIcon size={14} />
                      {profile.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            setUp
          )
        }
        copy={copy}
        key={request.id}
        scope={profileFolder === null ? notChosen : profileName(profileFolder)}
        scopeIcon={UserCircleIcon}
        tokens={permissionTokens(request)}
      />
    );
  };

  return sortPermissions(plugin.requiredPermissions).map((permission) => {
    const copy = describe(permission);
    switch (permission.id) {
      case "files":
        return filesCard(permission, copy);
      case "mods":
        return modsCard(permission, copy);
      case "network":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={permission.hosts.join(", ")}
            scopeIcon={GlobeIcon}
            scopeMono
            tokens={permissionTokens(permission)}
          />
        );
      case "game":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.game.scope")}
            scopeIcon={GameControllerIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "storage":
        return (
          <GrantCard
            action={
              <CardAction
                disabled={clearData.isPending}
                icon={EraserIcon}
                label={t("plugins.access.actions.clearData")}
                onClick={() => void confirmClearData()}
              />
            }
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.storage.value", {
              size: formatPluginSize(plugin.storageBytes),
            })}
            scopeIcon={HardDriveIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "events":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.events.scope")}
            scopeIcon={EyeIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "notifications":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.notifications.scope")}
            scopeIcon={BellIcon}
            tokens={permissionTokens(permission)}
          />
        );
    }
  });
};
