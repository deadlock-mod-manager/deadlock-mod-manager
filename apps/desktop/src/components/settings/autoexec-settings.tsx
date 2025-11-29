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
import { FolderOpen, PencilIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
  const { data: config, isLoading } = useQuery({
    queryKey: ["autoexec-config"],
    queryFn: getAutoexecConfig,
    retry: 3,
  });

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
      await queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
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
      <div className='space-y-4'>
        <Card className='p-0'>
          <CardHeader>
            <CardTitle>What's an Autoexec Config?</CardTitle>
            <CardDescription>
              <p>
                Autoexec is a CFG file for launching a game with set convars
                (think console command) that will get automatically executed on
                launch of the game.
              </p>
              <p>
                The mod manager uses this file to set the crosshair settings
                automatically without needing to run commands in the console.
                You can still edit the file manually if you want to to add more
                commands.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>

        <Form {...form}>
          <form className='space-y-4' onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-lg font-semibold'>
                    Current Autoexec Config
                  </FormLabel>
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
                isLoading={openFolderMutation.isPending}>
                <FolderOpen className='h-4 w-4' />
                {t("settings.openInFolder")}
              </Button>
              <Button
                onClick={handleOpenEditor}
                type='button'
                variant='outline'
                isLoading={openEditorMutation.isPending}>
                <PencilIcon className='h-4 w-4' />
                {t("settings.openInEditor")}
              </Button>
              <Button
                className='ml-auto'
                isLoading={saveMutation.isPending}
                disabled={saveMutation.isPending || !isDirty}
                type='submit'>
                {saveMutation.isPending
                  ? "Saving..."
                  : t("settings.saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Section>
  );
};
