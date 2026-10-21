import { analytics } from "@/lib/analytics";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpenIcon, PencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  type AutoexecReadonlySection,
  appendPredefinedCommand,
  commandExistsInContent,
  findCommandLineIndex,
  getAutoexecCommandFileComment,
  hasAutoexecLaunchableContent,
  normalizeAutoexecContent,
} from "@/lib/autoexec/autoexec-content";
import {
  disableAutoexecLaunchOptionIfEnabled,
  enableAutoexecLaunchOptionIfDisabled,
} from "@/lib/autoexec/launch-option";
import type { FlatAutoexecCommand } from "@/lib/autoexec/predefined-commands";
import logger from "@/lib/logger";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";
import { AutoexecCommandLibrary } from "./autoexec/autoexec-command-library";
import { AutoexecEditor } from "./autoexec/autoexec-editor";
import Section from "./section";

interface AutoexecConfig {
  full_content: string;
  editable_content: string;
  readonly_sections: AutoexecReadonlySection[];
}

const getAutoexecConfig = async (): Promise<AutoexecConfig> => {
  return invoke<AutoexecConfig>("get_autoexec_config");
};

const autoexecSchema = z.object({
  content: z.string(),
});

type AutoexecFormValues = z.infer<typeof autoexecSchema>;

export const AutoexecSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const isSilentSaveRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: config, isLoading } = useQuery({
    queryKey: ["autoexec-config"],
    queryFn: getAutoexecConfig,
    staleTime: STALE_TIME_LOCAL,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  const form = useForm<AutoexecFormValues>({
    resolver: zodResolver(autoexecSchema),
    defaultValues: {
      content: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (params: {
      fullContent: string;
      readonlySections: AutoexecReadonlySection[];
    }) => {
      return invoke<AutoexecConfig>("update_autoexec_config", params);
    },
    onSuccess: async (savedConfig) => {
      const wasSilentSave = isSilentSaveRef.current;

      if (!wasSilentSave) {
        analytics.track("autoexec_saved", {
          has_launchable_content: hasAutoexecLaunchableContent(
            savedConfig.full_content,
          ),
        });
        toast.success(t("settings.autoexecSaved"));

        if (hasAutoexecLaunchableContent(savedConfig.full_content)) {
          enableAutoexecLaunchOptionIfDisabled();
        } else {
          disableAutoexecLaunchOptionIfEnabled();
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.autoexecSaveError"));
    },
    onSettled: () => {
      isSilentSaveRef.current = false;
    },
  });

  useEffect(() => {
    if (!config) {
      return;
    }

    const normalizedContent = normalizeAutoexecContent(config.editable_content);

    if (normalizedContent !== config.editable_content) {
      form.reset({ content: normalizedContent });
      isSilentSaveRef.current = true;
      saveMutation.mutate({
        fullContent: normalizedContent,
        readonlySections: config.readonly_sections,
      });
      return;
    }

    form.reset({ content: config.editable_content });
  }, [config, form]);

  const openFolderMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_folder"),
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.autoexecOpenFolderError"));
    },
  });

  const openEditorMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_editor"),
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.autoexecOpenEditorError"));
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (currentConfig: AutoexecConfig) => {
      return invoke<AutoexecConfig>("update_autoexec_config", {
        fullContent: "",
        readonlySections: currentConfig.readonly_sections,
      });
    },
    onSuccess: async (savedConfig) => {
      if (!hasAutoexecLaunchableContent(savedConfig.full_content)) {
        disableAutoexecLaunchOptionIfEnabled();
      }
      queryClient.setQueryData<AutoexecConfig>(
        ["autoexec-config"],
        savedConfig,
      );
      form.reset({ content: savedConfig.editable_content });
      toast.success(t("settings.autoexecCleared"));
      await queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.autoexecSaveError"));
    },
  });

  const onSubmit = (values: AutoexecFormValues) => {
    if (!config) {
      return;
    }

    saveMutation.mutate({
      fullContent: values.content,
      readonlySections: config.readonly_sections,
    });
  };

  const handleOpenFolder = () => {
    openFolderMutation.mutate();
  };

  const handleOpenEditor = () => {
    openEditorMutation.mutate();
  };

  const handleClear = async () => {
    if (!config) {
      return;
    }

    const confirmed = await confirm({
      title: t("settings.autoexecClearConfirmTitle"),
      body: t("settings.autoexecClearConfirmBody"),
      actionButton: t("settings.autoexecClearConfirmAction"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    clearMutation.mutate(config);
  };

  const watchedContent = form.watch("content");

  const revealCommand = useCallback((content: string, commandKey: string) => {
    const lineIndex = findCommandLineIndex(content, commandKey);
    if (lineIndex === -1) {
      return;
    }

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const lines = content.split("\n");
      const start = lines
        .slice(0, lineIndex)
        .reduce((offset, line) => offset + line.length + 1, 0);
      const lineHeight = Number.parseFloat(
        getComputedStyle(textarea).lineHeight,
      );

      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, start + lines[lineIndex].length);
      textarea.scrollTop =
        lineIndex * lineHeight - textarea.clientHeight / 2 + lineHeight;
    });
  }, []);

  const handleAddCommand = useCallback(
    (command: FlatAutoexecCommand) => {
      if (commandExistsInContent(watchedContent, command.command)) {
        return;
      }

      const description = getAutoexecCommandFileComment(command.id);
      const nextContent = appendPredefinedCommand(
        watchedContent,
        command.command,
        command.value,
        description,
      );

      form.setValue("content", nextContent, { shouldDirty: true });
      revealCommand(nextContent, command.command);
      toast.success(t("settings.autoexecCommandAdded"));
    },
    [form, revealCommand, t, watchedContent],
  );

  const isDirty = watchedContent !== config?.editable_content;

  if (isLoading) {
    return (
      <Section
        description={t("settings.autoexecDescription")}
        title={t("settings.autoexec")}>
        <div className='flex items-center justify-center py-8'>
          <p className='text-muted-foreground'>{t("common.loading")}</p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      action={
        <div className='flex items-center gap-2'>
          {isDirty && (
            <span className='text-xs text-yellow-400'>
              {t("settings.autoexecUnsaved")}
            </span>
          )}
          <Button
            icon={<PencilIcon className='h-4 w-4' />}
            isLoading={openEditorMutation.isPending}
            onClick={handleOpenEditor}
            size='sm'
            type='button'
            variant='outline'>
            {t("settings.openInEditor")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("settings.openInFolder")}
                icon={<FolderOpenIcon className='h-4 w-4' />}
                isLoading={openFolderMutation.isPending}
                onClick={handleOpenFolder}
                size='sm'
                type='button'
                variant='outline'
              />
            </TooltipTrigger>
            <TooltipContent>{t("settings.openInFolder")}</TooltipContent>
          </Tooltip>
          <Button
            disabled={
              clearMutation.isPending || watchedContent.trim().length === 0
            }
            icon={<TrashIcon className='h-4 w-4' />}
            isLoading={clearMutation.isPending}
            onClick={handleClear}
            size='sm'
            type='button'
            variant='outline'>
            {t("settings.autoexecClear")}
          </Button>
          <Button
            disabled={saveMutation.isPending || !isDirty}
            isLoading={saveMutation.isPending}
            onClick={form.handleSubmit(onSubmit)}
            size='sm'
            type='button'>
            {saveMutation.isPending
              ? t("settings.autoexecSaving")
              : t("settings.saveChanges")}
          </Button>
        </div>
      }
      className='xl:h-full xl:min-h-0'
      description={
        <>
          {t("settings.autoexecDescription")}{" "}
          <Popover>
            <PopoverTrigger className='text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid'>
              {t("settings.autoexecInfoTitle")}
            </PopoverTrigger>
            <PopoverContent align='start' className='w-96 space-y-2 text-sm'>
              <p>{t("settings.autoexecInfoBody1")}</p>
              <p>{t("settings.autoexecInfoBody2")}</p>
              <p>{t("settings.autoexecInfoBody3")}</p>
            </PopoverContent>
          </Popover>
        </>
      }
      innerClassName='grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-rows-[minmax(0,1fr)]'
      title={t("settings.autoexec")}>
      <div className='flex h-[420px] min-h-0 flex-col overflow-hidden rounded-md border border-border/40 bg-background/30 xl:h-auto'>
        <div className='flex items-center gap-2 border-border/30 border-b px-3 py-2'>
          <span className='font-mono font-semibold text-sm'>autoexec.cfg</span>
        </div>
        <AutoexecEditor
          onChange={(value) =>
            form.setValue("content", value, { shouldDirty: true })
          }
          readonlySections={config?.readonly_sections ?? []}
          textareaRef={textareaRef}
          value={watchedContent}
        />
      </div>

      <AutoexecCommandLibrary
        content={watchedContent}
        onAddCommand={handleAddCommand}
        onRevealCommand={(command) =>
          revealCommand(watchedContent, command.command)
        }
      />
    </Section>
  );
};
