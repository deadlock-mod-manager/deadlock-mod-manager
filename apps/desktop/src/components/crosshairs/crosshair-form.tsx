import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";
import type { CreateCrosshairDto } from "@deadlock-mods/shared";
import { DeadlockHeroes } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import {
  Check,
  CheckIcon,
  Download,
  RotateCcwIcon,
  UploadIcon,
} from "@deadlock-mods/ui/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { type FieldValues, type SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { publishCrosshair } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";
import { CrosshairControls } from "./crosshair/crosshair-controls";
import { CrosshairImportDialog } from "./crosshair-import-dialog";

const ALL_HEROES = ["Default", ...Object.values(DeadlockHeroes)];

const crosshairFormSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name must be at most 50 characters"),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional(),
  tags: z.array(z.string()).max(10, "Maximum 10 tags allowed").default([]),
  heroes: z
    .array(z.string())
    .min(1, "At least one hero must be selected")
    .max(5, "Maximum 5 heroes allowed"),
  config: z.custom<CrosshairConfig>(),
});

type CrosshairFormValues = z.infer<typeof crosshairFormSchema>;

export const CrosshairForm = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { setActiveCrosshair } = usePersistedStore();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );
  const [tagInput, setTagInput] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const form = useForm<CrosshairFormValues>({
    // @ts-expect-error - react-hook-form version conflicts
    resolver: zodResolver(crosshairFormSchema),
    defaultValues: {
      name: "",
      description: "",
      tags: [],
      heroes: ["Default"],
      config: DEFAULT_CROSSHAIR_CONFIG,
    },
  });

  const currentConfig = form.watch("config");
  const currentTags = form.watch("tags");

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    const tags = currentTags || [];
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      form.setValue("tags", [...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const tags = currentTags || [];
    form.setValue(
      "tags",
      tags.filter((tag) => tag !== tagToRemove),
    );
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: CrosshairConfig) => {
      if (!crosshairsEnabled) {
        throw new Error("Custom crosshairs are disabled");
      }
      return invoke("apply_crosshair_to_autoexec", { config: crosshairConfig });
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (_, crosshairConfig) => {
      setActiveCrosshair(crosshairConfig);
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      if (
        error instanceof Error &&
        error.message === "Custom crosshairs are disabled"
      ) {
        toast.error(t("crosshairs.disabledError"));
      } else {
        toast.error(t("crosshairs.form.applyError"));
      }
    },
  });

  const publishCrosshairMutation = useMutation({
    mutationFn: (data: CreateCrosshairDto) => publishCrosshair(data),
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: () => {
      toast.success(t("crosshairs.form.published"));
      queryClient.invalidateQueries({ queryKey: ["crosshairs"] });
      form.reset({
        name: "",
        description: "",
        tags: [],
        heroes: ["Default"],
        config: DEFAULT_CROSSHAIR_CONFIG,
      });
    },
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(
        error instanceof Error
          ? error.message
          : t("crosshairs.form.publishError"),
      );
    },
  });

  const handleApply = () => {
    applyCrosshairMutation.mutate(currentConfig);
  };

  const handleImport = (config: CrosshairConfig) => {
    form.setValue("config", config);
  };

  const onSubmit: SubmitHandler<CrosshairFormValues> = (values) => {
    if (!isAuthenticated) {
      toast.error(t("crosshairs.form.loginRequired"));
      return;
    }

    publishCrosshairMutation.mutate({
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      config: values.config,
      tags: values.tags || [],
      heroes: values.heroes,
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit as SubmitHandler<FieldValues>)}
        className='flex flex-col gap-6 h-full'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          <div className='space-y-6 pr-2 overflow-y-auto w-full max-h-[70vh]'>
            <div>
              <CrosshairControls
                config={currentConfig}
                onChange={(newConfig) => form.setValue("config", newConfig)}
              />
            </div>

            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>
                {t("crosshairs.form.metadata")}
              </h3>

              <FormField
                // @ts-expect-error - react-hook-form version conflicts
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("crosshairs.form.name")}{" "}
                      <span className='text-destructive'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("crosshairs.form.namePlaceholder")}
                        maxLength={50}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-expect-error - react-hook-form version conflicts
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("crosshairs.form.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t(
                          "crosshairs.form.descriptionPlaceholder",
                        )}
                        maxLength={500}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='space-y-2'>
                <div className='text-sm font-medium'>
                  {t("crosshairs.form.tags")}{" "}
                  <span className='text-muted-foreground'>
                    (e.g: "streamer", "troll")
                  </span>
                </div>
                <div className='flex gap-2'>
                  <Input
                    id='tags'
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder={t("crosshairs.form.tagsPlaceholder")}
                    disabled={(currentTags?.length || 0) >= 10}
                  />
                  <Button
                    type='button'
                    onClick={handleAddTag}
                    disabled={
                      !tagInput.trim() || (currentTags?.length || 0) >= 10
                    }>
                    {t("crosshairs.form.addTag")}
                  </Button>
                </div>
                {currentTags && currentTags.length > 0 && (
                  <div className='flex flex-wrap gap-2 mt-2'>
                    {currentTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant='secondary'
                        className='cursor-pointer'
                        onClick={() => handleRemoveTag(tag)}>
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <FormField
                // @ts-expect-error - react-hook-form version conflicts
                control={form.control}
                name='heroes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("crosshairs.form.heroes")}{" "}
                      <span className='text-destructive'>*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            role='combobox'
                            className='w-full justify-between'>
                            <span className='truncate'>
                              {field.value.length === 0
                                ? t("crosshairs.form.selectHeroes")
                                : field.value.length === 1
                                  ? field.value[0]
                                  : `${field.value.length} ${t("crosshairs.form.heroesSelected")}`}
                            </span>
                            <span className='ml-2 opacity-50'>▼</span>
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent align='start' className='w-[400px] p-0'>
                        <Command>
                          <CommandInput
                            placeholder={t("crosshairs.form.searchHeroes")}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {t("crosshairs.form.noHeroesFound")}
                            </CommandEmpty>
                            <CommandGroup>
                              {ALL_HEROES.map((hero) => {
                                const isSelected = field.value.includes(hero);
                                const isDefault = hero === "Default";
                                const canSelect =
                                  isSelected ||
                                  field.value.length < 5 ||
                                  isDefault;

                                return (
                                  <CommandItem
                                    key={hero}
                                    disabled={!canSelect}
                                    onSelect={() => {
                                      if (isDefault) {
                                        field.onChange(
                                          isSelected ? [] : ["Default"],
                                        );
                                      } else {
                                        const newHeroes = isSelected
                                          ? field.value.filter(
                                              (h) => h !== hero,
                                            )
                                          : [
                                              ...field.value.filter(
                                                (h) => h !== "Default",
                                              ),
                                              hero,
                                            ];
                                        field.onChange(
                                          newHeroes.length === 0
                                            ? ["Default"]
                                            : newHeroes,
                                        );
                                      }
                                    }}>
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 flex-shrink-0",
                                        isSelected
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    <span className='truncate'>{hero}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {field.value.length > 0 && (
                      <div className='flex flex-wrap gap-2 mt-2'>
                        {field.value.map((hero) => (
                          <Badge
                            key={hero}
                            variant='secondary'
                            className='cursor-pointer'
                            onClick={() => {
                              const newHeroes = field.value.filter(
                                (h) => h !== hero,
                              );
                              field.onChange(
                                newHeroes.length === 0
                                  ? ["Default"]
                                  : newHeroes,
                              );
                            }}>
                            {hero} ×
                          </Badge>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className='space-y-4'>
            <div className='sticky top-4'>
              <h3 className='text-lg font-semibold mb-4'>
                {t("crosshairs.form.preview")}
              </h3>
              <div className='bg-zinc-800 rounded-lg overflow-hidden p-4'>
                <CrosshairCanvas config={currentConfig} interactive />
              </div>
            </div>
          </div>
        </div>

        <div className='flex justify-between'>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              icon={<Download className='h-4 w-4' />}
              onClick={() => setImportDialogOpen(true)}>
              {t("crosshairs.form.import.button")}
            </Button>
            <Button
              type='button'
              variant='outline'
              icon={<RotateCcwIcon className='h-4 w-4' />}
              onClick={() => form.reset()}>
              Reset Crosshair
            </Button>
          </div>
          <div className='flex gap-2 justify-end'>
            <Button
              type='button'
              variant='secondary'
              icon={<CheckIcon className='h-4 w-4' />}
              onClick={handleApply}>
              {t("crosshairs.form.apply")}
            </Button>
            <Button
              type='submit'
              icon={<UploadIcon className='h-4 w-4' />}
              disabled={!isAuthenticated || publishCrosshairMutation.isPending}>
              {publishCrosshairMutation.isPending
                ? t("crosshairs.form.publishing")
                : t("crosshairs.form.publish")}
            </Button>
          </div>
        </div>
      </form>
      <CrosshairImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
      />
    </Form>
  );
};
