import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { PlusIcon, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useProgress } from "@/components/downloads/progress-indicator";
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from "@/components/mod-creation/mod-metadata-form";
import PageTitle from "@/components/shared/page-title";
import { ModPartsList } from "@/components/mod-creation/mod-parts-list";
import { pickModFiles, useFileDrop } from "@/hooks/use-file-drop";
import { useModProcessor } from "@/hooks/use-mod-processor";
import {
  getModCategoryDisplayName,
  MOD_CATEGORY_ORDER,
  ModCategory,
} from "@/lib/constants";
import { ALL_SUPPORTED_PATTERN } from "@/lib/file-patterns";
import {
  type DetectedSource,
  detectSource,
  discardStagedDrops,
  getFileBaseName,
  sourceFiles,
} from "@/lib/file-utils";
import logger from "@/lib/logger";
import { takePendingDrop } from "@/lib/pending-drop";
import { cn } from "@/lib/utils";
import { type AddModFormValues, addModSchema } from "@/types/add-mods";

const discardStaged = () =>
  discardStagedDrops().catch((error) =>
    logger.withError(error).warn("Failed to discard staged drop"),
  );

const fileStem = (file: File) =>
  getFileBaseName(file).replace(ALL_SUPPORTED_PATTERN, "");

const NAME_SEPARATOR = /[\s._-]/;

// Parts usually share a prefix ("skin_base", "skin_hair"), which names the mod.
// The prefix ends on a word boundary: "hero_alpha" and "hero_alt" give "hero".
const defaultModName = (source: DetectedSource): string => {
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
  return stems.length > 1 && prefix.length >= 3 ? prefix : stems[0];
};

const AddMods = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isProcessing } = useProgress();
  const [open, setOpen] = useState(false);
  const [detected, setDetected] = useState<DetectedSource | null>(null);
  const [initialMeta, setInitialMeta] = useState<
    Partial<ModMetadata> | undefined
  >(undefined);
  const metaRef = useRef<ModMetadataFormHandle>(null);

  const { processMod } = useModProcessor();

  const form = useForm<AddModFormValues>({
    resolver: zodResolver(addModSchema),
    defaultValues: { category: ModCategory.SKINS },
  });

  const handleFilesDetected = (detectedSource: DetectedSource) => {
    setDetected(detectedSource);
    form.reset({ category: ModCategory.SKINS });
    setInitialMeta({ name: defaultModName(detectedSource) });
    setOpen(true);
  };

  const replaceParts = (files: File[]) => {
    const source = detectSource(files);
    if (source) setDetected(source);
  };

  const handleAddParts = async () => {
    if (!detected) return;
    const picked = await pickModFiles(t("common.mods"), ["vpk"]);
    if (picked) replaceParts([...sourceFiles(detected), ...picked]);
  };

  const handleRemovePart = (file: File) => {
    if (!detected) return;
    replaceParts(sourceFiles(detected).filter((part) => part !== file));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      void discardStaged();
    }
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  const { isDragging, dragHandlers, openTauriFilePicker } = useFileDrop(
    handleFilesDetected,
    handleError,
  );

  // Picks up a file dropped elsewhere in the window (see GlobalFileDrop).
  useEffect(() => {
    const source = takePendingDrop();
    if (source) handleFilesDetected(source);
  }, []);

  const handleDropZoneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openTauriFilePicker();
    },
    [openTauriFilePicker],
  );

  const handleFinalize = async () => {
    const metadata = await metaRef.current?.validateAndGet();

    if (!metadata) {
      return;
    }

    if (!detected) {
      toast.error(t("addMods.noFilesDetected"));
      return;
    }

    const category = form.getValues("category");

    try {
      await processMod(metadata, category, detected);
      setOpen(false);
      void discardStaged();
    } catch (error) {
      logger.withError(error).error("Failed to process mod");
      toast.error(t("addMods.processingError"));
    }
  };

  return (
    <div className='w-full px-4'>
      <div className='space-y-8'>
        <div className='flex items-center gap-2 pt-4'>
          <Button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/my-mods");
              }
            }}
            variant='ghost'
            size='sm'
            icon={<ArrowLeft className='h-4 w-4' />}>
            {t("common.back")}
          </Button>
        </div>
        <PageTitle
          className='pt-0'
          subtitle={t("addMods.subtitle")}
          title={t("addMods.title")}
        />

        <Card className='w-full space-y-6 border-0 p-6 shadow'>
          <CardHeader className='p-0'>
            <CardTitle className='flex items-center gap-2'>
              <UploadSimple weight='duotone' />
              {t("addMods.cardTitle")}
            </CardTitle>
            <CardDescription>{t("addMods.cardDescription")}</CardDescription>
          </CardHeader>

          <CardContent className='space-y-6 p-0'>
            <div className='space-y-2'>
              <div
                className={cn(
                  "relative flex h-40 w-full cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors md:h-48",
                  isDragging
                    ? "bg-muted/50 ring-2 ring-primary/40"
                    : "hover:bg-muted/40",
                )}
                aria-label={t("addMods.dropAreaText")}
                onClick={openTauriFilePicker}
                onKeyDown={handleDropZoneKeyDown}
                role='button'
                tabIndex={0}
                {...dragHandlers}>
                <div className='pointer-events-none text-center'>
                  <UploadSimple className='mx-auto h-8 w-8' />
                  <div className='mt-2 font-medium text-sm'>
                    {t("addMods.dropAreaText")}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {t("addMods.supportedFormats")}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("addMods.finalizeTitle")}</DialogTitle>
            <DialogDescription>
              {t("addMods.finalizeDescription")}
            </DialogDescription>
          </DialogHeader>

          <ModMetadataForm hideCardChrome initial={initialMeta} ref={metaRef} />

          <div className='mt-4 space-y-4'>
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <FormField
                  control={form.control}
                  name='category'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("addMods.category")}</FormLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("addMods.selectCategory")}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MOD_CATEGORY_ORDER.map((c) => (
                            <SelectItem key={c} value={c}>
                              {getModCategoryDisplayName(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {detected?.kind === "archive" ? (
              <div className='rounded-md bg-muted p-3 text-xs'>
                <span className='font-medium'>{t("addMods.source")}:</span>{" "}
                Archive → {detected.file.name}
              </div>
            ) : detected ? (
              <ModPartsList
                disabled={isProcessing}
                files={sourceFiles(detected)}
                onAdd={handleAddParts}
                onRemove={handleRemovePart}
              />
            ) : null}
          </div>

          <DialogFooter className='mt-2'>
            <Button
              disabled={isProcessing}
              onClick={() => setOpen(false)}
              type='button'
              variant='ghost'>
              {t("addMods.cancel")}
            </Button>
            <Button
              disabled={isProcessing}
              icon={<PlusIcon className='h-4 w-4' />}
              isLoading={isProcessing}
              onClick={handleFinalize}
              type='button'>
              {isProcessing ? t("addMods.processing") : t("addMods.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddMods;
