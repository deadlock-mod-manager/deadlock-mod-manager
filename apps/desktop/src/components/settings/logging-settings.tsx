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

type AiProvider = "chatgpt" | "claude" | "gemini" | "perplexity";

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
};

const PROMPT_TEXT = `I need help troubleshooting Deadlock Mod Manager.

Docs: https://docs.deadlockmods.app/
GitHub: https://github.com/deadlock-mod-manager/deadlock-mod-manager

My issue is: [DESCRIBE YOUR ISSUE HERE]

[PASTE LOGS BELOW USING Ctrl+V]

`;

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

  const { data: logInfo } = useQuery({
    queryKey: ["log-info"],
    queryFn: () => invoke<LogInfo>("get_log_info"),
    staleTime: STALE_TIME_LOCAL,
  });

  const { data: gameConsoleLogExists } = useQuery({
    queryKey: ["game-console-log-exists"],
    queryFn: () => invoke<boolean>("get_game_console_log_exists"),
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

  const openGameConsoleLogMutation = useMutation({
    mutationFn: () => invoke("open_game_console_log"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openGameConsoleLogError"));
    },
  });

  const openGameConsoleLogFolderMutation = useMutation({
    mutationFn: () => invoke("open_game_console_log_folder"),
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.openGameConsoleLogFolderError"));
    },
  });

  const askAiMutation = useMutation({
    mutationFn: async () => {
      const provider = AI_PROVIDERS[selectedProvider];

      const logs = await invoke<string>("get_logs_for_ai", {
        maxChars: 100000,
      });

      await navigator.clipboard.writeText(logs);

      const url = `${provider.baseUrl}?${provider.queryParam}=${encodeURIComponent(PROMPT_TEXT)}`;
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
          <h4 className='font-medium text-sm'>
            {t("settings.gameConsoleLogs")}
          </h4>
          <p className='text-muted-foreground text-xs'>
            {t("settings.gameConsoleLogsDescription")}
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex gap-2'>
            <Button
              onClick={() => openGameConsoleLogFolderMutation.mutate()}
              variant='outline'
              isLoading={openGameConsoleLogFolderMutation.isPending}>
              <FolderOpenIcon className='h-4 w-4' />
              {t("settings.openLogsFolder")}
            </Button>
            {gameConsoleLogExists && (
              <Button
                onClick={() => openGameConsoleLogMutation.mutate()}
                variant='outline'
                isLoading={openGameConsoleLogMutation.isPending}>
                <PencilIcon className='h-4 w-4' />
                {t("settings.openInEditor")}
              </Button>
            )}
          </div>
          {!gameConsoleLogExists && (
            <div className='flex items-center gap-2 text-muted-foreground text-sm'>
              <WarningCircleIcon className='h-4 w-4' />
              <span>{t("settings.consoleLogNotFound")}</span>
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
        <div className='flex items-center gap-3'>
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
          <Button
            onClick={handleAskAi}
            variant='outline'
            isLoading={askAiMutation.isPending}
            disabled={!logInfo?.files.length}>
            <RobotIcon className='h-4 w-4' />
            {t("settings.askAiButton")}
          </Button>
        </div>
      </div>
    </div>
  );
};
