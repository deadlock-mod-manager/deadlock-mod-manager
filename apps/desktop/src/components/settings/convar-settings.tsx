import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpenIcon, PencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  hasAutoexecLaunchableContent,
  normalizeAutoexecContent,
} from "@/lib/autoexec/autoexec-content";
import {
  disableAutoexecLaunchOptionIfEnabled,
  enableAutoexecLaunchOptionIfDisabled,
} from "@/lib/autoexec/launch-option";
import logger from "@/lib/logger";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";
import Section from "./section";

interface ReadonlySection {
  start_line: number;
  end_line: number;
  content: string;
}

interface AutoexecConfig {
  full_content: string;
  editable_content: string;
  readonly_sections: ReadonlySection[];
}

const getAutoexecConfig = async (): Promise<AutoexecConfig> => {
  return invoke<AutoexecConfig>("get_autoexec_config");
};

const autoexecSchema = z.object({
  content: z.string(),
});

type AutoexecFormValues = z.infer<typeof autoexecSchema>;

export const ConvarSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const isSilentSaveRef = useRef(false);
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
      readonlySections: ReadonlySection[];
    }) => {
      return invoke<AutoexecConfig>("update_autoexec_config", params);
    },
    onSuccess: async (savedConfig) => {
      const wasSilentSave = isSilentSaveRef.current;

      if (!wasSilentSave) {
        toast.success(t("settings.convarSaved"));

        if (hasAutoexecLaunchableContent(savedConfig.full_content)) {
          enableAutoexecLaunchOptionIfDisabled();
        } else {
          disableAutoexecLaunchOptionIfEnabled();
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["autoexec-config"],
      });
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.convarSaveError"));
    },
    onSettled: () => {
      isSilentSaveRef.current = false;
    },
  });

  useEffect(() => {
    if (!config) {
      return;
    }

    const normalizedContent = normalizeAutoexecContent(config.full_content);

    if (normalizedContent !== config.full_content) {
      form.reset({ content: normalizedContent });
      isSilentSaveRef.current = true;
      saveMutation.mutate({
        fullContent: normalizedContent,
        readonlySections: config.readonly_sections,
      });
      return;
    }

    form.reset({ content: config.full_content });
  }, [config, form]);

  const openFolderMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_folder"),
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.convarOpenFolderError"));
    },
  });

  const openEditorMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_editor"),
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.convarOpenEditorError"));
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
      form.reset({ content: savedConfig.full_content });
      toast.success(t("settings.convarCleared"));
      await queryClient.invalidateQueries({
        queryKey: ["autoexec-config"],
      });
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.convarSaveError"));
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
      title: t("settings.convarClearConfirmTitle"),
      body: t("settings.convarClearConfirmBody"),
      actionButton: t("settings.convarClearConfirmAction"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    clearMutation.mutate(config);
  };

  const watchedContent = form.watch("content");

  // const handleAddCommand = useCallback(
  //     (command: FlatAutoexecCommand) => {
  //         if (commandExistsInContent(watchedContent, command.command)) {
  //             return;
  //         }

  //         const description = getAutoexecCommandFileComment(command.id);
  //         const nextContent = appendPredefinedCommand(
  //             watchedContent,
  //             command.command,
  //             command.value,
  //             description,
  //         );

  //         form.setValue("content", nextContent, { shouldDirty: true });
  //         toast.success(t("settings.convarCommandAdded"));
  //     },
  //     [form, t, watchedContent],
  // );

  const isDirty = watchedContent !== config?.full_content;

  if (isLoading) {
    return (
      <Section
        description={t("settings.convarDescription")}
        title={t("settings.convar")}>
        <div className='flex items-center justify-center py-8'>
          <p className='text-muted-foreground'>{t("common.loading")}</p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      description={t("settings.convarDescription")}
      title={t("settings.convar")}>
      <div className='space-y-6'>
        <Card className='p-0'>
          <CardHeader>
            <CardTitle>{t("settings.convarInfoTitle")}</CardTitle>
            <CardDescription className='space-y-3'>
              <p>{t("settings.convarInfoBody1")}</p>
              <p>{t("settings.convarInfoBody2")}</p>
            </CardDescription>
          </CardHeader>
        </Card>

        {/* <AutoexecCommandLibrary
                    content={watchedContent}
                    onAddCommand={handleAddCommand}
                /> */}

        <Form {...form}>
          <form className='space-y-4' onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-lg font-semibold'>
                    {t("settings.convarEditorHeading")}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className='font-mono text-sm min-h-[400px]'
                      onChange={field.onChange}
                      placeholder={t("settings.convarPlaceholder")}
                      value={field.value}
                    />
                  </FormControl>
                  {config && config.readonly_sections.length > 0 && (
                    <div className='mt-2 text-xs text-muted-foreground'>
                      {t("settings.convarReadonlyNote")}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex gap-2'>
              <Button
                isLoading={openFolderMutation.isPending}
                onClick={handleOpenFolder}
                type='button'
                variant='outline'>
                <FolderOpenIcon className='h-4 w-4' />
                {t("settings.openInFolder")}
              </Button>
              <Button
                isLoading={openEditorMutation.isPending}
                onClick={handleOpenEditor}
                type='button'
                variant='outline'>
                <PencilIcon className='h-4 w-4' />
                {t("settings.openInEditor")}
              </Button>
              <Button
                disabled={
                  clearMutation.isPending || watchedContent.trim().length === 0
                }
                isLoading={clearMutation.isPending}
                onClick={handleClear}
                type='button'
                variant='outline'>
                <TrashIcon className='h-4 w-4' />
                {t("settings.convarClear")}
              </Button>
              <Button
                className='ml-auto'
                disabled={saveMutation.isPending || !isDirty}
                isLoading={saveMutation.isPending}
                type='submit'>
                {saveMutation.isPending
                  ? t("settings.convarSaving")
                  : t("settings.saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Section>
  );
};
