import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { ModdingArchiveText } from "@/types/generated/ModdingArchiveText";
import type { ArchiveContentTarget } from "@/lib/archive-content-search";
import { DocumentTextView } from "./document-text-view";

export function ArchiveContentPreview({
  archivePath,
  target,
}: {
  archivePath: string;
  target: ArchiveContentTarget;
}) {
  const { t } = useTranslation();
  const document = useQuery({
    queryKey: ["workbench-archive-search-text", archivePath, target.path],
    queryFn: () =>
      invoke<ModdingArchiveText>("read_modding_archive_text", {
        archivePath,
        path: target.path,
      }),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <section
      className='flex h-full min-h-0 flex-col'
      aria-label={t("workbenchContentSearch.matchPreview")}>
      <header className='shrink-0 border-b p-3 text-xs'>
        <p className='truncate font-medium' title={target.path}>
          {target.path}
        </p>
        <p className='pt-1 text-[11px] text-muted-foreground'>
          {t(
            document.data?.decoded
              ? "workbenchContentSearch.decodedHint"
              : "workbenchContentSearch.textHint",
          )}
        </p>
      </header>
      {document.data ? (
        <DocumentTextView
          key={target.path}
          text={document.data.text}
          match={target.match}
        />
      ) : (
        <p role={document.error ? "alert" : "status"} className='p-3 text-xs'>
          {document.error?.message ?? t("common.loading")}
        </p>
      )}
    </section>
  );
}
