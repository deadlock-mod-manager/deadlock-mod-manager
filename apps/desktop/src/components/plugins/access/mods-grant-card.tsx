import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { KeyIcon, UserCircleIcon, UserSwitchIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CardAction } from "@/components/plugins/access/card-action";
import { GrantCard } from "@/components/plugins/access/grant-card";
import type { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import {
  allowsDefaultProfile,
  type ModsRequest,
  type PermissionCopy,
  permissionTokens,
} from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const ModsGrantCard = ({
  plugin,
  grant,
  request,
  copy,
  onNavigate,
}: {
  plugin: ExternalPluginSummary;
  grant: ReturnType<typeof usePluginActions>["grant"];
  request: ModsRequest;
  copy: PermissionCopy;
  onNavigate?: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const current = plugin.grant;
  const notChosen = t("plugins.access.actions.notChosen");
  const { testProfiles, defaultProfile, profileName } = usePluginProfiles();
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
