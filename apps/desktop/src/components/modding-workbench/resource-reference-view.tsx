import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { ModdingReference } from "@/types/generated/ModdingReference";
import type { ModdingResourceDocument } from "@/types/generated/ModdingResourceDocument";
import { ResourceEditor } from "./resource-editor";
interface Props {
  reference: ModdingReference;
  addonId?: string;
  archivePath?: string;
  onReference: (reference: ModdingReference) => void;
}
export const ResourceReferenceView = ({
  reference,
  addonId,
  archivePath,
  onReference,
}: Props) => {
  const { t } = useTranslation();
  const local = reference.origin === "addon" ? addonId : undefined;
  const archive = reference.origin === "stock" ? undefined : archivePath;
  const path = reference.path.endsWith(".vtex")
    ? `${reference.path}_c`
    : reference.path;
  const hierarchy = path.endsWith("_c") ? "game" : "content";
  const isImage = /\.(png|jpg|jpeg|tga|vtex_c)$/i.test(path);
  const image = useQuery({
    queryKey: ["workbench-reference-image", local ?? archive ?? "stock", path],
    queryFn: () =>
      invoke<string>(
        local ? "preview_modding_image" : "preview_modding_archive_file",
        { addonId: local, archivePath: archive, hierarchy, path },
      ),
    enabled: isImage,
    staleTime: 60_000,
    retry: false,
  });
  const document = useQuery({
    queryKey: [
      "workbench-reference-resource",
      local ?? archive ?? "stock",
      path,
    ],
    queryFn: () =>
      invoke<ModdingResourceDocument>("inspect_modding_resource", {
        addonId: local,
        archivePath: archive,
        hierarchy,
        path,
      }),
    enabled: !isImage,
    staleTime: 60_000,
    retry: false,
  });
  return image.data ? (
    <div className='flex h-full items-center justify-center overflow-auto'>
      <img
        src={image.data}
        alt={path}
        className='max-h-full max-w-full object-contain'
      />
    </div>
  ) : document.data ? (
    <ResourceEditor
      document={{ ...document.data, editable: false }}
      path={path}
      backup=''
      onBackup={() => {}}
      onReference={onReference}
    />
  ) : (
    <p
      role={image.error || document.error ? "alert" : "status"}
      className='p-3 text-xs'>
      {image.error?.message ?? document.error?.message ?? t("common.loading")}
    </p>
  );
};
