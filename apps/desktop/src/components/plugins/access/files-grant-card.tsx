import {
  FileIcon,
  FolderOpenIcon,
  FolderSimpleIcon,
  KeyIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CardAction } from "@/components/plugins/access/card-action";
import { GrantCard } from "@/components/plugins/access/grant-card";
import type { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import {
  chooseGrantedPath,
  type FilesRequest,
  type PermissionCopy,
  permissionTokens,
} from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const PATH_SEPARATOR = /[\\/]/;

/** `C:\Users\me\Downloads\out.vpk` → `Downloads\out.vpk`, keeping the path's own separator. */
const shortPath = (path: string) => {
  const separator = path.includes("\\") ? "\\" : "/";
  return path.split(PATH_SEPARATOR).filter(Boolean).slice(-2).join(separator);
};

export const FilesGrantCard = ({
  plugin,
  grant,
  request,
  copy,
  onNavigate,
}: {
  plugin: ExternalPluginSummary;
  grant: ReturnType<typeof usePluginActions>["grant"];
  request: FilesRequest;
  copy: PermissionCopy;
  onNavigate?: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
