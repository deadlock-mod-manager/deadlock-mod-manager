import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import {
  CircleNotchIcon,
  CopyIcon,
  FloppyDiskIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { exportPerfConfig } from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";

const snippetFileName = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "performance-config"}-convars.txt`;
};

const CopyButton = ({ text }: { text: string }) => {
  const { t } = useTranslation();
  const copy = useMutation({
    mutationFn: () => writeText(text),
    onSuccess: () => toast.success(t("performance.export.copied")),
    onError: (error) => {
      logger.withError(error).warn("Copying performance export failed");
      toast.error(t("performance.export.copyFailed"));
    },
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <Button
      icon={<CopyIcon aria-hidden />}
      isLoading={copy.isPending}
      onClick={() => copy.mutate()}
      size='sm'
      variant='outline'>
      {t("performance.export.copy")}
    </Button>
  );
};

const SaveSnippetButton = ({
  name,
  snippet,
}: {
  name: string;
  snippet: string;
}) => {
  const { t } = useTranslation();
  const saveFile = useMutation({
    mutationFn: async () => {
      const path = await saveDialog({
        title: t("performance.export.snippet.saveTitle"),
        defaultPath: snippetFileName(name),
        filters: [{ name: "ConVars", extensions: ["txt", "gi"] }],
      });
      if (path === null) return null;
      await writeTextFile(path, snippet);
      return path;
    },
    onSuccess: (path) => {
      if (path) toast.success(t("performance.export.snippet.saved", { path }));
    },
    onError: (error) => {
      logger.withError(error).error("Saving ConVars snippet failed");
      toast.error(t("performance.export.snippet.saveFailed"), {
        description: getErrorMessage(error),
      });
    },
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <Button
      icon={<FloppyDiskIcon aria-hidden />}
      isLoading={saveFile.isPending}
      onClick={() => saveFile.mutate()}
      size='sm'
      variant='outline'>
      {t("performance.export.snippet.saveFile")}
    </Button>
  );
};

const ExportContent = ({ request }: { request: PerfApplyRequest }) => {
  const { t } = useTranslation();
  const exported = useQuery({
    queryKey: perfQueryKeys.shareExport(request),
    queryFn: () => exportPerfConfig(request),
    meta: { skipGlobalErrorHandler: true },
  });

  if (exported.isPending) {
    return (
      <p className='flex items-center gap-2 text-muted-foreground text-sm'>
        <CircleNotchIcon className='size-4 animate-spin' />
        {t("performance.export.loading")}
      </p>
    );
  }
  if (exported.isError) {
    return (
      <div className='flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'>
        <p className='font-medium'>{t("performance.export.failed")}</p>
        <p className='break-words font-mono text-muted-foreground text-xs'>
          {getErrorMessage(exported.error)}
        </p>
      </div>
    );
  }

  const { shareCode, snippet } = exported.data;
  return (
    <div className='flex flex-col gap-5'>
      <section className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className='font-medium text-sm'>
            {t("performance.export.shareCode.label")}
          </h3>
          <CopyButton text={shareCode} />
        </div>
        <Textarea
          aria-label={t("performance.export.shareCode.label")}
          className='h-20 resize-none break-all font-mono text-xs md:text-xs'
          readOnly
          value={shareCode}
        />
        <p className='text-muted-foreground text-xs'>
          {t("performance.export.shareCode.help")}
        </p>
      </section>
      <section className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className='font-medium text-sm'>
            {t("performance.export.snippet.label")}
          </h3>
          <div className='flex gap-2'>
            <CopyButton text={snippet} />
            <SaveSnippetButton name={request.name} snippet={snippet} />
          </div>
        </div>
        <Textarea
          aria-label={t("performance.export.snippet.label")}
          className='h-48 resize-none font-mono text-xs md:text-xs'
          readOnly
          spellCheck={false}
          value={snippet}
        />
        <p className='text-muted-foreground text-xs'>
          {t("performance.export.snippet.help")}
        </p>
      </section>
    </div>
  );
};

/** Share code and ConVars snippet for the config that is applied now. */
export const ExportConfigButton = () => {
  const { t } = useTranslation();
  const { data: status } = usePerfStatus();
  const [open, setOpen] = useState(false);
  const desired = status?.desired ?? null;

  return (
    <>
      <Button
        disabled={!desired}
        icon={<ShareNetworkIcon aria-hidden />}
        onClick={() => setOpen(true)}
        title={desired ? undefined : t("performance.export.needsConfig")}
        variant='outline'>
        {t("performance.export.button")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open && desired !== null}>
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {t("performance.export.title", {
                name: desired?.request.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("performance.export.description")}
            </DialogDescription>
          </DialogHeader>
          {desired && <ExportContent request={desired.request} />}
        </DialogContent>
      </Dialog>
    </>
  );
};
