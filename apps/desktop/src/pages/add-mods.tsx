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
import { UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ProgressIndicator,
  useProgress,
} from "@/components/downloads/progress-indicator";
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from "@/components/mod-creation/mod-metadata-form";
import PageTitle from "@/components/shared/page-title";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { MOD_CATEGORY_ORDER, ModCategory } from "@/lib/constants";
import {
  ACCEPTED_FILE_TYPES,
  ALL_SUPPORTED_PATTERN,
} from "@/lib/file-patterns";
import { type DetectedSource, getFileName } from "@/lib/file-utils";
import logger from "@/lib/logger";
import { cn } from "@/lib/utils";
import { type AddModFormValues, addModSchema } from "@/types/add-mods";

const AddMods = () => {
  const { t } = useTranslation();
  const { isProcessing } = useProgress();
  const [open, setOpen] = useState(false);
  const [detected, setDetected] = useState<DetectedSource | null>(null);
  const [initialMeta, setInitialMeta] = useState<
    Partial<ModMetadata> | undefined
  >(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const metaRef = useRef<ModMetadataFormHandle>(null);

  const { processMod } = useModProcessor();

  const form = useForm<AddModFormValues>({
    resolver: zodResolver(addModSchema),
    defaultValues: { category: ModCategory.SKINS, sourceType: "vpk" },
  });

  const handleFilesDetected = (detectedSource: DetectedSource) => {
    const baseName = detectedSource.file.name.replace(
      ALL_SUPPORTED_PATTERN,
      "",
    );
    setDetected(detectedSource);
    form.reset({
      category: ModCategory.SKINS,
      sourceType: detectedSource.kind,
    });
    setInitialMeta({ name: baseName || "" });
    setOpen(true);
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  const { isDragging, dragHandlers, onFileSelect } = useFileDrop(
    handleFilesDetected,
    handleError,
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
    } catch (error) {
      logger.error("Failed to process mod:", error);
      toast.error(t("addMods.processingError"));
    }
  };

  return (
    <div className='w-full px-4'>
      <div className='space-y-8'>
        <PageTitle
          subtitle={t("addMods.subtitle")}
          title={t("addMods.title")}
        />

        <Card className='w-full space-y-6 border-0 shadow'>
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
                onClick={() => fileInputRef.current?.click()}
                {...dragHandlers}>
                <input
                  accept={ACCEPTED_FILE_TYPES}
                  className='hidden'
                  multiple
                  onChange={onFileSelect}
                  ref={fileInputRef}
                  type='file'
                />
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

      <Dialog onOpenChange={setOpen} open={open}>
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
                              {c}
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

            <div className='rounded-md bg-muted p-3 text-xs'>
              {form.getValues("sourceType") === "archive" &&
              detected?.kind === "archive" ? (
                <div>
                  <span className='font-medium'>{t("addMods.source")}:</span>{" "}
                  Archive → {detected.file.name}
                </div>
              ) : detected?.kind === "vpk" ? (
                <div>
                  <span className='font-medium'>{t("addMods.source")}:</span>{" "}
                  VPK → {getFileName(detected.file)}
                </div>
              ) : null}
            </div>
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
              onClick={handleFinalize}
              type='button'>
              {isProcessing ? t("addMods.processing") : t("addMods.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProgressIndicator />
    </div>
  );
};

export default AddMods;
