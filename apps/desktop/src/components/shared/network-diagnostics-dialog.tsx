import { Button, type ButtonProps } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleNotchIcon,
  CopyIcon,
  StethoscopeIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkDiagnostics } from "@/hooks/use-network-diagnostics";
import type {
  NetworkCheckResult,
  NetworkCheckStatus,
} from "@/lib/network-diagnostics";
import { cn } from "@/lib/utils";

const STATUS_PAGE_URL = "https://status.deadlockmods.app";

const STATUS_ICONS: Record<NetworkCheckStatus, ReactNode> = {
  pending: <CircleDashedIcon className='size-5 text-muted-foreground/60' />,
  running: (
    <CircleNotchIcon className='size-5 text-primary motion-safe:animate-spin' />
  ),
  ok: <CheckCircleIcon className='size-5 text-green-500' weight='fill' />,
  warning: (
    <WarningCircleIcon className='size-5 text-yellow-500' weight='fill' />
  ),
  error: <XCircleIcon className='size-5 text-destructive' weight='fill' />,
};

const describeResult = (t: TFunction, result: NetworkCheckResult): string => {
  if (result.status === "pending") return t("networkDiagnostics.pending");
  if (result.status === "running") return t("networkDiagnostics.running");
  if (!result.message) return "";
  const message = t(
    `networkDiagnostics.results.${result.message}`,
    result.params,
  );
  return result.latencyMs === undefined
    ? message
    : `${message} · ${t("networkDiagnostics.latency", { ms: result.latencyMs })}`;
};

const buildReport = (t: TFunction, results: NetworkCheckResult[]): string =>
  results
    .map(
      (result) =>
        `[${result.status.toUpperCase()}] ${t(`networkDiagnostics.checks.${result.id}`)}: ${describeResult(t, result)}${result.url ? ` (${result.url})` : ""}`,
    )
    .join("\n");

const copy = async (t: TFunction, value: string, toastKey: string) => {
  await navigator.clipboard.writeText(value);
  toast.success(t(toastKey));
};

const CheckRow = ({ result }: { result: NetworkCheckResult }) => {
  const { t } = useTranslation();
  const failed = result.status === "error" || result.status === "warning";
  // The probed address is what has to be unblocked or shared with support, and
  // it is not always the default one: a custom API URL shows up here too.
  const showUrl = failed && result.url !== undefined;

  return (
    <li
      className='flex gap-3 py-2.5'
      data-check-id={result.id}
      data-check-status={result.status}>
      <div className='pt-0.5'>{STATUS_ICONS[result.status]}</div>
      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            "text-sm font-medium",
            result.status === "pending" && "text-muted-foreground",
          )}>
          {t(`networkDiagnostics.checks.${result.id}`)}
        </p>
        <p
          className={cn(
            "text-xs",
            result.status === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}>
          {describeResult(t, result)}
        </p>
        {showUrl && result.url && (
          <div className='mt-1.5 flex items-center gap-1.5'>
            <code className='min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground'>
              {result.url}
            </code>
            <Button
              aria-label={t("networkDiagnostics.copyUrl")}
              className='size-7 shrink-0'
              onClick={() =>
                void copy(t, result.url ?? "", "networkDiagnostics.urlCopied")
              }
              size='icon'
              title={t("networkDiagnostics.copyUrl")}
              variant='ghost'>
              <CopyIcon className='h-3.5 w-3.5' />
            </Button>
          </div>
        )}
        {failed && result.fixes.length > 0 && (
          <div className='mt-2 rounded-md border border-border/50 bg-muted/40 px-3 py-2'>
            <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
              {t("networkDiagnostics.howToFix")}
            </p>
            <ul className='mt-1 list-inside list-disc text-xs text-foreground/90'>
              {result.fixes.map((fix) => (
                <li key={fix}>
                  {t(`networkDiagnostics.fixes.${fix}`, {
                    host: result.host ?? "",
                    url: result.url ?? "",
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
};

const NetworkDiagnosticsDialog = ({
  open,
  onOpenChange,
  diagnostics: { results, verdict, isRunning, run },
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostics: ReturnType<typeof useNetworkDiagnostics>;
}) => {
  const { t } = useTranslation();

  const copyReport = () =>
    copy(t, buildReport(t, results), "networkDiagnostics.copied");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t("networkDiagnostics.title")}</DialogTitle>
          <DialogDescription>
            {t("networkDiagnostics.description")}
          </DialogDescription>
        </DialogHeader>

        <ul className='divide-y divide-border/40' aria-live='polite'>
          {results.map((result) => (
            <CheckRow key={result.id} result={result} />
          ))}
        </ul>

        <p
          role='status'
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            verdict === "ok" && "bg-green-500/10 text-green-600",
            verdict === "warning" && "bg-yellow-500/10 text-yellow-600",
            verdict === "error" && "bg-destructive/10 text-destructive",
            verdict === "running" && "bg-muted/50 text-muted-foreground",
          )}>
          {t(`networkDiagnostics.verdict.${verdict}`)}
        </p>

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            onClick={() => void openUrl(STATUS_PAGE_URL)}
            size='sm'
            variant='link'>
            status.deadlockmods.app
          </Button>
          <div className='flex gap-2'>
            <Button
              disabled={isRunning}
              icon={<CopyIcon />}
              onClick={() => void copyReport()}
              size='sm'
              variant='outline'>
              {t("networkDiagnostics.copy")}
            </Button>
            <Button
              disabled={isRunning}
              icon={<ArrowClockwiseIcon />}
              onClick={run}
              size='sm'>
              {t("networkDiagnostics.runAgain")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const NetworkDiagnosticsButton = ({
  variant = "outline",
  size,
  className,
}: Pick<ButtonProps, "variant" | "size" | "className">) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const diagnostics = useNetworkDiagnostics();

  return (
    <>
      <Button
        className={className}
        icon={<StethoscopeIcon className='h-4 w-4' />}
        onClick={() => {
          setOpen(true);
          diagnostics.run();
        }}
        size={size}
        variant={variant}>
        {t("networkDiagnostics.open")}
      </Button>
      <NetworkDiagnosticsDialog
        diagnostics={diagnostics}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
};
