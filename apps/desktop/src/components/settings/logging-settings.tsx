import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  FolderOpenIcon,
  PencilIcon,
  RobotIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import logger from "@/lib/logger";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";

interface LogFileInfo {
  name: string;
  path: string;
  size: number;
}

interface LogInfo {
  log_dir: string;
  files: LogFileInfo[];
  total_size: number;
}

interface CrashDumpFile {
  name: string;
  path: string;
  size: number;
  modified: string | null;
}

interface CrashDumpInfo {
  path: string;
  exists: boolean;
  files: CrashDumpFile[];
  total_count: number;
  total_size: number;
}

type AiProvider = "chatgpt" | "claude" | "gemini" | "perplexity" | "t3chat";

type LogSource = "dmm" | "crash" | "combined";

interface AiProviderConfig {
  name: string;
  baseUrl: string;
  queryParam: string;
}

const AI_PROVIDERS: Record<AiProvider, AiProviderConfig> = {
  chatgpt: {
    name: "ChatGPT",
    baseUrl: "https://chat.openai.com/",
    queryParam: "q",
  },
  claude: {
    name: "Claude",
    baseUrl: "https://claude.ai/new",
    queryParam: "q",
  },
  gemini: {
    name: "Google Gemini",
    baseUrl: "https://gemini.google.com/app",
    queryParam: "text",
  },
  perplexity: {
    name: "Perplexity",
    baseUrl: "https://www.perplexity.ai/",
    queryParam: "q",
  },
  t3chat: {
    name: "T3 Chat",
    baseUrl: "https://t3.chat/",
    queryParam: "q",
  },
};

const getPromptText = (logSource: LogSource): string => {
  const logContext = {
    dmm: `The logs I'm sharing are from the Deadlock Mod Manager (DMM) application itself.
These are NOT crash dumps from the Deadlock game, but logs from the mod manager application.`,
    crash: `The logs I'm sharing are crash dumps from the Deadlock game (by Valve).
These are NOT logs from the Deadlock Mod Manager application, but minidump crash reports generated when the Deadlock game crashes.`,
    combined: `The logs I'm sharing include BOTH:
1. Deadlock Mod Manager (DMM) application logs
2. Deadlock game crash dumps (minidump files from when the game crashes)`,
  }[logSource];

  return `I need help troubleshooting Deadlock Mod Manager.

Docs: https://docs.deadlockmods.app/
GitHub: https://github.com/deadlock-mod-manager/deadlock-mod-manager

${logContext}

My issue is: [DESCRIBE YOUR ISSUE HERE]

[PASTE LOGS BELOW USING Ctrl+V]

`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
};

export const LoggingSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [selectedProvider, setSelectedProvider] =
    useState<AiProvider>("chatgpt");
  const [selectedLogSource, setSelectedLogSource] =
    useState<LogSource>("combined");

  const { data: logInfo } = useQuery({
    queryKey: ["log-info"],
    queryFn: () => invoke<LogInfo>("get_log_info"),
    staleTime: STALE_TIME_LOCAL,
  });

  const openLogsFolderMutation = useMutation({
    mutationFn: () => invoke("open_logs_folder"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openLogsFolderError"));
    },
  });

  const openLogFileMutation = useMutation({
    mutationFn: () => invoke("open_log_file"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openLogFileError"));
    },
  });

  const { data: crashDumpInfo } = useQuery({
    queryKey: ["crash-dump-info"],
    queryFn: () => invoke<CrashDumpInfo>("get_crash_dumps_info"),
    staleTime: STALE_TIME_LOCAL,
  });

  const openCrashDumpsFolderMutation = useMutation({
    mutationFn: () => invoke("open_crash_dumps_folder"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openCrashDumpsFolderError"));
    },
  });

  const openLatestCrashDumpMutation = useMutation({
    mutationFn: () => invoke("open_latest_crash_dump_parsed"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openCrashDumpError"));
    },
  });

  const askAiMutation = useMutation({
    mutationFn: async () => {
      const provider = AI_PROVIDERS[selectedProvider];

      const logs = await invoke<string>("get_logs_for_ai", {
        maxChars: 100000,
        logSource: selectedLogSource,
      });

      await navigator.clipboard.writeText(logs);

      const url = `${provider.baseUrl}?${provider.queryParam}=${encodeURIComponent(getPromptText(selectedLogSource))}`;
      await openUrl(url);
      return provider.name;
    },
    onSuccess: (providerName) => {
      toast.success(
        t("settings.logsCopiedAndAiOpened", { provider: providerName }),
      );
    },
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.askAiError"));
    },
  });

  const handleAskAi = async () => {
    const confirmed = await confirm({
      title: t("settings.askAiConfirmTitle"),
      body: t("settings.askAiConfirmBody"),
      actionButton: t("settings.askAiConfirmAction"),
      cancelButton: t("common.cancel"),
    });

    if (confirmed) {
      askAiMutation.mutate();
    }
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <div className='space-y-1'>
          <h4 className='font-medium text-sm'>
            {t("settings.modManagerLogs")}
          </h4>
          <p className='text-muted-foreground text-xs'>
            {t("settings.modManagerLogsDescription")}
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex gap-2'>
            <Button
              onClick={() => openLogsFolderMutation.mutate()}
              variant='outline'
              isLoading={openLogsFolderMutation.isPending}>
              <FolderOpenIcon className='h-4 w-4' />
              {t("settings.openLogsFolder")}
            </Button>
            <Button
              onClick={() => openLogFileMutation.mutate()}
              variant='outline'
              isLoading={openLogFileMutation.isPending}
              disabled={!logInfo?.files.length}>
              <PencilIcon className='h-4 w-4' />
              {t("settings.openLogFile")}
            </Button>
          </div>
          {logInfo && logInfo.files.length > 0 && (
            <span className='text-muted-foreground text-sm'>
              {t("settings.logFilesCount", { count: logInfo.files.length })} •{" "}
              {formatFileSize(logInfo.total_size)}
            </span>
          )}
        </div>
      </div>

      <div className='space-y-3'>
        <div className='space-y-1'>
          <h4 className='font-medium text-sm'>{t("settings.crashDumps")}</h4>
          <p className='text-muted-foreground text-xs'>
            {t("settings.crashDumpsDescription")}
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex gap-2'>
            <Button
              onClick={() => openCrashDumpsFolderMutation.mutate()}
              variant='outline'
              isLoading={openCrashDumpsFolderMutation.isPending}>
              <FolderOpenIcon className='h-4 w-4' />
              {t("settings.openLogsFolder")}
            </Button>
            {crashDumpInfo && crashDumpInfo.total_count > 0 && (
              <Button
                onClick={() => openLatestCrashDumpMutation.mutate()}
                variant='outline'
                isLoading={openLatestCrashDumpMutation.isPending}>
                <PencilIcon className='h-4 w-4' />
                {t("settings.openLatestCrashDump")}
              </Button>
            )}
          </div>
          {crashDumpInfo && crashDumpInfo.total_count > 0 ? (
            <span className='text-muted-foreground text-sm'>
              {t("settings.crashDumpFilesCount", {
                count: crashDumpInfo.total_count,
              })}{" "}
              • {formatFileSize(crashDumpInfo.total_size)}
            </span>
          ) : (
            <div className='flex items-center gap-2 text-muted-foreground text-sm'>
              <WarningCircleIcon className='h-4 w-4' />
              <span>{t("settings.noCrashDumpsFound")}</span>
            </div>
          )}
        </div>
      </div>

      <div className='space-y-3'>
        <div className='space-y-1'>
          <h4 className='font-medium text-sm'>{t("settings.askAi")}</h4>
          <p className='text-muted-foreground text-xs'>
            {t("settings.askAiDescription")}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <Label htmlFor='ai-provider' className='text-sm'>
              {t("settings.aiProvider")}
            </Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) =>
                setSelectedProvider(value as AiProvider)
              }>
              <SelectTrigger id='ai-provider' className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AI_PROVIDERS).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-2'>
            <Label htmlFor='log-source' className='text-sm'>
              {t("settings.logSource")}
            </Label>
            <Select
              value={selectedLogSource}
              onValueChange={(value) =>
                setSelectedLogSource(value as LogSource)
              }>
              <SelectTrigger id='log-source' className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='combined'>
                  {t("settings.logSourceCombined")}
                </SelectItem>
                <SelectItem value='dmm'>
                  {t("settings.logSourceDmm")}
                </SelectItem>
                <SelectItem value='crash'>
                  {t("settings.logSourceCrash")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAskAi}
            variant='outline'
            isLoading={askAiMutation.isPending}
            disabled={
              (selectedLogSource === "dmm" && !logInfo?.files.length) ||
              (selectedLogSource === "crash" && !crashDumpInfo?.total_count) ||
              (selectedLogSource === "combined" &&
                !logInfo?.files.length &&
                !crashDumpInfo?.total_count)
            }>
            <RobotIcon className='h-4 w-4' />
            {t("settings.askAiButton")}
          </Button>
        </div>
      </div>
    </div>
  );
};
