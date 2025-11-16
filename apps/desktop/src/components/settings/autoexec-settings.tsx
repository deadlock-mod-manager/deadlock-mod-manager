import { Button } from "@deadlock-mods/ui/components/button";
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
import { FolderOpen, PencilIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { z } from "zod";
import logger from "@/lib/logger";
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

export const AutoexecSettings = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery(
    "autoexec-config",
    getAutoexecConfig,
    {
      retry: 3,
      onError: (error) => {
        logger.error(error);
        toast.error(t("settings.autoexecLoadError"));
      },
    },
  );

  const form = useForm<AutoexecFormValues>({
    resolver: zodResolver(autoexecSchema),
    defaultValues: {
      content: "",
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        content: config.full_content,
      });
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: async (params: {
      fullContent: string;
      readonlySections: ReadonlySection[];
    }) => {
      return invoke("update_autoexec_config", params);
    },
    onSuccess: async () => {
      toast.success(t("settings.autoexecSaved"));
      await queryClient.invalidateQueries("autoexec-config");
    },
    onError: (error) => {
      logger.error(error);
      toast.error(t("settings.autoexecSaveError"));
    },
  });

  const openFolderMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_folder"),
    onError: (error) => {
      logger.error(error);
      toast.error(t("settings.autoexecOpenFolderError"));
    },
  });

  const openEditorMutation = useMutation({
    mutationFn: () => invoke("open_autoexec_editor"),
    onError: (error) => {
      logger.error(error);
      toast.error(t("settings.autoexecOpenEditorError"));
    },
  });

  const onSubmit = (values: AutoexecFormValues) => {
    if (!config) return;
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

  const watchedContent = form.watch("content");

  useEffect(() => {
    if (!config || config.readonly_sections.length === 0) return;

    const hasStartMarker = watchedContent.includes(
      "// === Deadlock Mod Manager - Crosshair Settings (DO NOT EDIT) ===",
    );
    const hasEndMarker = watchedContent.includes(
      "// === End Crosshair Settings ===",
    );

    if (!hasStartMarker || !hasEndMarker) {
      toast.warning(
        t("settings.autoexecReadonlySectionDeleted", {
          defaultValue:
            "Read-only sections cannot be deleted. They will be restored on save.",
        }),
      );
    }
  }, [watchedContent, config, t]);

  const isDirty = watchedContent !== config?.full_content;

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
      description={t("settings.autoexecDescription")}
      title={t("settings.autoexec")}>
      {/* @ts-expect-error - react-hook-form types */}
      <Form {...form}>
        <form className='space-y-4' onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            // @ts-expect-error - react-hook-form types
            control={form.control}
            name='content'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.autoexecContent")}</FormLabel>
                <FormControl>
                  <Textarea
                    className='font-mono text-sm min-h-[400px]'
                    onChange={field.onChange}
                    placeholder={t("settings.autoexecPlaceholder")}
                    value={field.value}
                  />
                </FormControl>
                {config && config.readonly_sections.length > 0 && (
                  <div className='mt-2 text-xs text-muted-foreground'>
                    {t("settings.autoexecReadonlyNote")}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='flex gap-2'>
            <Button
              onClick={handleOpenFolder}
              type='button'
              variant='outline'
              isLoading={openFolderMutation.isLoading}>
              <FolderOpen className='h-4 w-4' />
              {t("settings.openInFolder")}
            </Button>
            <Button
              onClick={handleOpenEditor}
              type='button'
              variant='outline'
              isLoading={openEditorMutation.isLoading}>
              <PencilIcon className='h-4 w-4' />
              {t("settings.openInEditor")}
            </Button>
            <Button
              className='ml-auto'
              isLoading={saveMutation.isLoading}
              disabled={saveMutation.isLoading || !isDirty}
              type='submit'>
              {saveMutation.isLoading ? "Saving..." : t("settings.saveChanges")}
            </Button>
          </div>
        </form>
      </Form>
    </Section>
  );
};
