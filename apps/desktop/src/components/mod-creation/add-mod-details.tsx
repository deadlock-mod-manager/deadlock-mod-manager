import { Button } from "@deadlock-mods/ui/components/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useProgress } from "@/components/downloads/progress-indicator";
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from "@/components/mod-creation/mod-metadata-form";
import {
  type ImportMode,
  ModPartsList,
} from "@/components/mod-creation/mod-parts-list";
import { pickModFiles } from "@/hooks/use-file-drop";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { IMPORT_MODS_KEY } from "@/lib/add-mod-dialog";
import {
  getModCategoryDisplayName,
  MOD_CATEGORY_ORDER,
  ModCategory,
} from "@/lib/constants";
import { ALL_SUPPORTED_PATTERN } from "@/lib/file-patterns";
import {
  type DetectedSource,
  detectSource,
  getFileBaseName,
  getSourceFilePath,
  sourceFiles,
} from "@/lib/file-utils";
import {
  detectedMapName,
  localModContentsOptions,
  partContentsFor,
  suggestCategory,
} from "@/lib/local-mod-contents";
import logger from "@/lib/logger";
import { filesCoverOptions } from "@/lib/mod-thumbnails";
import { cn } from "@/lib/utils";
import { type AddModFormValues, addModSchema } from "@/types/add-mods";

const fileStem = (file: File) =>
  getFileBaseName(file).replace(ALL_SUPPORTED_PATTERN, "");

const NAME_SEPARATOR = /[\s._-]/;

const sharedName = (source: DetectedSource): string | null => {
  const stems = sourceFiles(source).map(fileStem).sort();
  let prefix = stems[0];
  for (const stem of stems) {
    while (!stem.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const endsAtWord = stems.every(
    (stem) =>
      stem.length === prefix.length || NAME_SEPARATOR.test(stem[prefix.length]),
  );
  if (!endsAtWord) prefix = prefix.replace(/[^\s._-]*$/, "");
  prefix = prefix.replace(/[\s._-]+$/, "");
  return stems.length > 1 && prefix.length >= 3 ? prefix : null;
};

interface AddModDetailsProps {
  source: DetectedSource;
  onSourceChange: (source: DetectedSource) => void;
  onClose: () => void;
}

export const AddModDetails = ({
  source,
  onSourceChange,
  onClose,
}: AddModDetailsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setProcessing } = useProgress();
  const { processMod } = useModProcessor();
  const [mode, setMode] = useState<ImportMode>(() =>
    source.kind === "vpks" && !sharedName(source) ? "separate" : "one",
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [mapNameTouched, setMapNameTouched] = useState(false);
  const [initialMeta] = useState<Partial<ModMetadata>>(() => ({
    name: sharedName(source) ?? fileStem(sourceFiles(source)[0]),
  }));
  const metaRef = useRef<ModMetadataFormHandle>(null);
  const submitting = useRef(false);

  const form = useForm<AddModFormValues>({
    resolver: zodResolver(addModSchema),
    defaultValues: { category: ModCategory.SKINS, mapName: "" },
  });
  const category = form.watch("category");
  const mapName = form.watch("mapName");

  const partPaths =
    source.kind === "archive"
      ? []
      : sourceFiles(source).flatMap((file) => getSourceFilePath(file) ?? []);
  const separate = source.kind === "vpks" && mode === "separate";
  const { data: contents, isFetching: inspecting } = useQuery(
    localModContentsOptions(partPaths),
  );
  const coverPaths = separate
    ? []
    : (contents ?? [])
        .filter((part) => part.reskinsHero)
        .map((part) => part.filePath);
  const cover = useQuery(filesCoverOptions(coverPaths));

  const suggestedCategory =
    contents && !separate ? suggestCategory(contents) : null;
  const categoryDetected =
    !categoryTouched &&
    suggestedCategory !== null &&
    category === suggestedCategory;
  const categoryIsFallback =
    separate && contents?.some((part) => suggestCategory([part]) !== null);

  useEffect(() => {
    if (!categoryTouched && !inspecting) {
      form.setValue("category", suggestedCategory ?? ModCategory.SKINS);
    }
  }, [suggestedCategory, categoryTouched, inspecting, form]);

  const detectedMap = contents && !separate ? detectedMapName(contents) : null;
  const mapNameDetected =
    !mapNameTouched && detectedMap !== null && mapName === detectedMap;
  const askMapName = category === ModCategory.MAPS && !separate;

  useEffect(() => {
    if (!mapNameTouched && !inspecting) {
      form.setValue("mapName", detectedMap ?? "");
    }
  }, [detectedMap, mapNameTouched, inspecting, form]);

  const replaceParts = (files: File[]) => {
    const next = detectSource(files);
    if (next) onSourceChange(next);
  };

  const handleAddParts = async () => {
    const picked = await pickModFiles(t("common.mods"), ["vpk"]);
    if (picked) replaceParts([...sourceFiles(source), ...picked]);
  };

  const importSeparately = async (
    metadata: ModMetadata,
    files: File[],
  ): Promise<string[]> => {
    const modIds: string[] = [];
    for (const file of files) {
      const part = partContentsFor(contents, file);
      const partCategory = (part && suggestCategory([part])) ?? category;
      const modId = await processMod(
        {
          ...metadata,
          name: fileStem(file),
          mapName: part ? detectedMapName([part]) : null,
        },
        partCategory,
        { kind: "vpk", file },
        { announce: false },
      );
      if (modId) modIds.push(modId);
    }
    return modIds;
  };

  const importMods = useMutation({
    mutationKey: IMPORT_MODS_KEY,
    mutationFn: async (metadata: ModMetadata): Promise<string[]> => {
      if (separate) return importSeparately(metadata, sourceFiles(source));
      const modId = await processMod(
        {
          ...metadata,
          renderedCover: cover.data,
          mapName: askMapName ? form.getValues("mapName")?.trim() : null,
        },
        category,
        source,
        { announce: false },
      );
      return modId ? [modId] : [];
    },
    onSuccess: (modIds, metadata) => {
      if (modIds.length === 0) return;
      onClose();
      toast.success(
        modIds.length === 1
          ? t("addMods.addedSuccess", { name: metadata.name })
          : t("addMods.addedMods", { count: modIds.length }),
      );
      navigate("/my-mods");
    },
    onError: (error) => {
      setProcessing(false);
      logger.withError(error).error("Failed to process mod");
      toast.error(t("addMods.processingError"));
    },
    onSettled: () => {
      submitting.current = false;
    },
    meta: { skipGlobalErrorHandler: true },
  });

  const handleFinalize = async () => {
    if (submitting.current) return;
    submitting.current = true;
    const metadata = await metaRef.current?.validateAndGet();
    const valid = await form.trigger(
      askMapName ? ["category", "mapName"] : "category",
    );
    if (metadata && valid) importMods.mutate(metadata);
    else submitting.current = false;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("addMods.finalizeTitle")}</DialogTitle>
        <DialogDescription>
          {separate
            ? t("addMods.finalizeDescriptionSeparate")
            : t("addMods.finalizeDescription")}
        </DialogDescription>
      </DialogHeader>

      <ModMetadataForm
        defaultImagePending={cover.isFetching}
        defaultImageSrc={separate ? null : cover.data}
        hideCardChrome
        hideName={separate}
        imageNote={
          separate
            ? undefined
            : cover.isFetching
              ? t("addMods.renderingCover")
              : cover.data
                ? t("addMods.coverFromFiles")
                : undefined
        }
        initial={initialMeta}
        ref={metaRef}
      />

      <div className='mt-4 space-y-4'>
        <Form {...form}>
          <form onSubmit={(event) => event.preventDefault()}>
            <FormField
              control={form.control}
              name='category'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between gap-2'>
                    <FormLabel>{t("addMods.category")}</FormLabel>
                    {(categoryDetected || categoryIsFallback) && (
                      <span
                        className='text-muted-foreground text-xs'
                        data-testid='category-detected'>
                        {categoryIsFallback
                          ? t("addMods.categoryFallback")
                          : t("addMods.categoryDetected")}
                      </span>
                    )}
                  </div>
                  <Select
                    onValueChange={(value) => {
                      if (!value) return;
                      setCategoryTouched(true);
                      field.onChange(value);
                    }}
                    value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("addMods.selectCategory")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MOD_CATEGORY_ORDER.map((option) => (
                        <SelectItem key={option} value={option}>
                          {getModCategoryDisplayName(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {askMapName && (
              <FormField
                control={form.control}
                name='mapName'
                render={({ field, fieldState }) => (
                  <FormItem className='mt-4'>
                    <FormLabel>{t("addMods.mapName")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className='font-mono'
                        data-testid='map-name'
                        onChange={(event) => {
                          setMapNameTouched(true);
                          field.onChange(event);
                          form.clearErrors("mapName");
                        }}
                        placeholder={t("addMods.mapNamePlaceholder")}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <p
                      className={cn(
                        "text-xs",
                        fieldState.error
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}>
                      {fieldState.error
                        ? t("addMods.mapNameInvalid")
                        : mapNameDetected
                          ? t("addMods.mapNameDetected")
                          : t("addMods.mapNameHint")}
                    </p>
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>

        {source.kind === "archive" ? (
          <div className='rounded-md bg-muted p-3 text-xs'>
            <span className='font-medium'>{t("addMods.source")}:</span>{" "}
            {t("addMods.archiveSource", { name: source.file.name })}
          </div>
        ) : (
          <ModPartsList
            contents={contents}
            disabled={importMods.isPending}
            files={sourceFiles(source)}
            mode={mode}
            onAdd={handleAddParts}
            onModeChange={setMode}
            onRemove={(file) =>
              replaceParts(sourceFiles(source).filter((part) => part !== file))
            }
          />
        )}
      </div>

      <DialogFooter className='mt-2'>
        <Button
          disabled={importMods.isPending}
          onClick={onClose}
          type='button'
          variant='ghost'>
          {t("addMods.cancel")}
        </Button>
        <Button
          disabled={importMods.isPending || inspecting}
          icon={<PlusIcon className='h-4 w-4' />}
          isLoading={importMods.isPending}
          onClick={handleFinalize}
          type='button'>
          {importMods.isPending
            ? t("addMods.processing")
            : separate
              ? t("addMods.addCount", { count: sourceFiles(source).length })
              : t("addMods.add")}
        </Button>
      </DialogFooter>
    </>
  );
};
