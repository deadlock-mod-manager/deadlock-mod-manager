import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deadlock-mods/ui/components/radio-group";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  ArchiveIcon,
  ArrowSquareOutIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  FileIcon,
  FileZipIcon,
  GlobeIcon,
  HardDrivesIcon,
  HeartIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Markup } from "interweave";
import { type ClipboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMod } from "@/lib/api-client";
import { pickableVariants } from "@/lib/performance/import/review";
import {
  fileNameFromPath,
  type ImportModContext,
  looksLikeShareCode,
} from "@/lib/performance/import/save";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { cn, formatSize } from "@/lib/utils";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";
import type { ImportVariant } from "@/types/generated/ImportVariant";
import { ArchiveExtrasNote } from "./archive-extras-note";
import { ConfigTextArea } from "./config-text-area";
import { CurrentGameinfoSource } from "./current-gameinfo-source";
import { GameBananaSource } from "./gamebanana-source";

const SOURCE_TABS = [
  { value: "paste", icon: ClipboardTextIcon },
  { value: "file", icon: FileIcon },
  { value: "gamebanana", icon: GlobeIcon },
  { value: "current", icon: HardDrivesIcon },
] as const;
export type SourceTab = (typeof SOURCE_TABS)[number]["value"];

export const isSourceTab = (value: string): value is SourceTab =>
  SOURCE_TABS.some((tab) => tab.value === value);

const CONFIG_EXTENSIONS = ["gi", "cfg", "txt", "zip", "rar", "7z"];

export const initialTab = (source: ImportSource | null): SourceTab => {
  switch (source?.kind) {
    case "file":
      return "file";
    case "gameBanana":
      return "gamebanana";
    case "currentGameinfo":
      return "current";
    default:
      return "paste";
  }
};

/** Sources that arrive from elsewhere in the app instead of from the tabs. */
export const isHandedOver = (source: ImportSource | null) =>
  source?.kind === "staged" || source?.kind === "gameBanana";

export const VariantPicker = ({
  title,
  variants,
  value,
  disabled,
  onPick,
  className,
}: {
  title: string;
  variants: ImportVariant[];
  value: string | null;
  disabled?: boolean;
  onPick: (variantPath: string) => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const pickable = pickableVariants(variants);
  if (pickable.length < 2) return <ArchiveExtrasNote variants={variants} />;

  return (
    <div className='flex flex-col gap-2'>
      <span className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
        {title}
      </span>
      <RadioGroup
        className={cn("gap-1.5", className)}
        disabled={disabled}
        onValueChange={onPick}
        value={value ?? undefined}>
        {pickable.map((variant) => (
          <Label
            className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5'
            key={variant.path}>
            <RadioGroupItem className='mt-0.5 shrink-0' value={variant.path} />
            <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <span className='truncate font-medium text-sm'>
                {variant.label}
              </span>
              <span className='text-muted-foreground text-xs'>
                {t(`performance.import.formats.${variant.format}`)}{" "}
                <span className='break-all font-mono'>({variant.path})</span>
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      <ArchiveExtrasNote variants={variants} />
    </div>
  );
};

const GameBananaHandedOverSource = ({
  modId,
  fileId,
  onChangeSource,
}: {
  modId: number;
  fileId: number;
  onChangeSource: () => void;
}) => {
  const { t } = useTranslation();
  const remoteId = String(modId);
  const mod = useQuery({
    queryKey: ["mod", remoteId],
    queryFn: () => getMod(remoteId),
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });
  const files = useQuery({
    queryKey: perfQueryKeys.gameBananaFiles(modId),
    queryFn: () =>
      invoke<CatalogDownloadsDto>("get_gamebanana_submission_files", {
        remoteId,
      }),
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });
  const file = files.data?.downloads.find(
    (download) => download.fileId === String(fileId),
  );
  const cover = mod.data?.images?.[0];
  const fallbackTitle = t("performance.import.handedOver.gameBanana", {
    modId,
    fileId,
  });

  return (
    <div className='flex flex-col overflow-hidden rounded-lg border bg-card/40'>
      <div className='relative aspect-video w-full overflow-hidden bg-secondary'>
        {cover ? (
          <img
            alt={mod.data?.name ?? ""}
            className='h-full w-full object-cover'
            src={cover}
          />
        ) : mod.isLoading ? (
          <Skeleton className='h-full w-full rounded-none' />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <GlobeIcon className='size-8 text-muted-foreground' />
          </div>
        )}
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent' />
        <div className='absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4'>
          {mod.isLoading ? (
            <Skeleton className='h-6 w-48' />
          ) : (
            <h3 className='line-clamp-2 font-semibold text-foreground text-xl leading-tight'>
              {mod.data?.name ?? fallbackTitle}
            </h3>
          )}
          {mod.data?.author && (
            <span className='truncate text-muted-foreground text-sm'>
              {t("performance.import.handedOver.byAuthor", {
                author: mod.data.author,
              })}
            </span>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-3 p-4'>
        {mod.data && (
          <div className='flex items-center gap-4 text-muted-foreground text-xs'>
            <span className='flex items-center gap-1.5'>
              <DownloadSimpleIcon className='size-3.5' />
              {mod.data.downloadCount.toLocaleString()}
            </span>
            <span className='flex items-center gap-1.5'>
              <HeartIcon className='size-3.5' />
              {mod.data.likes.toLocaleString()}
            </span>
          </div>
        )}
        {mod.data?.description && (
          <div className='line-clamp-3 text-muted-foreground text-sm leading-relaxed'>
            <Markup content={mod.data.description} noHtml tagName='span' />
          </div>
        )}
        {file && (
          <div className='flex items-center gap-2 rounded-md border bg-background/40 px-3 py-2'>
            <FileZipIcon className='size-4 shrink-0 text-muted-foreground' />
            <span className='truncate font-mono text-xs'>{file.name}</span>
            {file.size > 0 && (
              <span className='ml-auto shrink-0 text-muted-foreground text-xs'>
                {formatSize(file.size)}
              </span>
            )}
          </div>
        )}
        <div className='flex items-center justify-between gap-2'>
          <Button onClick={onChangeSource} size='sm' variant='outline'>
            {t("performance.import.handedOver.changeSource")}
          </Button>
          {mod.data?.remoteUrl && (
            <Button
              className='gap-1.5'
              onClick={() => void openUrl(mod.data.remoteUrl)}
              size='sm'
              variant='ghost'>
              {t("performance.import.handedOver.viewOnGameBanana")}
              <ArrowSquareOutIcon className='size-3.5' />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const HandedOverSource = ({
  source,
  context,
  onChangeSource,
}: {
  source: ImportSource;
  context: ImportModContext | null;
  onChangeSource: () => void;
}) => {
  const { t } = useTranslation();
  if (source.kind === "gameBanana") {
    return (
      <GameBananaHandedOverSource
        fileId={source.file_id}
        modId={source.mod_id}
        onChangeSource={onChangeSource}
      />
    );
  }
  const title = context
    ? t("performance.import.handedOver.modDownload", {
        modName: context.modName,
      })
    : t("performance.import.handedOver.archive");
  return (
    <div className='flex items-start gap-3 rounded-md border bg-card/40 px-3 py-2.5'>
      <ArchiveIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='font-medium text-sm'>{title}</span>
        <button
          className='self-start text-primary text-xs hover:underline'
          onClick={onChangeSource}
          type='button'>
          {t("performance.import.handedOver.changeSource")}
        </button>
      </div>
    </div>
  );
};

/** Rendered by the dialog across both columns; must sit inside its `Tabs` root. */
export const ImportSourceTabList = () => {
  const { t } = useTranslation();
  return (
    <TabsList className='h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent px-5 py-2'>
      {SOURCE_TABS.map(({ value, icon: Icon }) => (
        <TabsTrigger
          className='h-8 gap-2 px-3 text-muted-foreground hover:text-foreground data-[state=active]:bg-muted data-[state=active]:shadow-none'
          key={value}
          value={value}>
          <Icon className='size-4 shrink-0' />
          {t(`performance.import.tabs.${value}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
};

type ImportSourcePanelProps = {
  initialSource: ImportSource | null;
  context: ImportModContext | null;
  /** False while a handed-over source replaces the tabs. */
  tabsVisible: boolean;
  onShowTabs: () => void;
  report: ImportReport | null;
  isAnalyzing: boolean;
  onAnalyze: (source: ImportSource) => void;
  onPickVariant: (variantPath: string) => void;
};

export const ImportSourcePanel = ({
  initialSource,
  context,
  report,
  isAnalyzing,
  onAnalyze,
  onPickVariant,
  tabsVisible,
  onShowTabs,
}: ImportSourcePanelProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState(
    initialSource?.kind === "text" ? initialSource.text : "",
  );
  const [filePath, setFilePath] = useState<string | null>(
    initialSource?.kind === "file" ? initialSource.path : null,
  );

  const analyzeText = (value: string) =>
    onAnalyze({ kind: "text", text: value, file_name: null });

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (text.trim().length === 0 && pasted.trim().length > 0) {
      analyzeText(pasted);
    }
  };

  const chooseFile = async () => {
    const chosen = await openDialog({
      multiple: false,
      title: t("performance.import.file.dialogTitle"),
      filters: [
        {
          name: t("performance.import.file.filterName"),
          extensions: CONFIG_EXTENSIONS,
        },
      ],
    });
    if (chosen === null) return;
    setFilePath(chosen);
    onAnalyze({ kind: "file", path: chosen });
  };

  return (
    <div className='flex flex-auto shrink-0 flex-col gap-4'>
      {tabsVisible || !initialSource ? (
        <>
          <TabsContent
            className='mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden'
            value='paste'>
            <ConfigTextArea
              className='min-h-32 flex-1'
              entries={report?.resolved.entries ?? null}
              label={t("performance.import.paste.label")}
              onChange={setText}
              onPaste={handlePaste}
              placeholder={t("performance.import.paste.placeholder")}
              value={text}
            />
            <div className='flex items-center justify-between gap-2'>
              <span className='text-muted-foreground text-xs'>
                {looksLikeShareCode(text) &&
                  t("performance.import.paste.shareCodeDetected")}
              </span>
              <Button
                disabled={text.trim().length === 0}
                isLoading={isAnalyzing}
                onClick={() => analyzeText(text)}
                size='sm'
                variant='outline'>
                {t("performance.import.paste.review")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent className='mt-0 flex flex-col gap-3' value='file'>
            <p className='text-muted-foreground text-xs'>
              {t("performance.import.file.description")}
            </p>
            {filePath && (
              <div className='flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm'>
                <FileIcon className='size-4 shrink-0 text-muted-foreground' />
                <span className='truncate font-mono text-xs' title={filePath}>
                  {fileNameFromPath(filePath)}
                </span>
              </div>
            )}
            <Button
              className='self-start'
              isLoading={isAnalyzing}
              onClick={chooseFile}
              variant='outline'>
              {filePath
                ? t("performance.import.file.chooseAnother")
                : t("performance.import.file.choose")}
            </Button>
          </TabsContent>

          <TabsContent className='mt-0' value='gamebanana'>
            <GameBananaSource isAnalyzing={isAnalyzing} onAnalyze={onAnalyze} />
          </TabsContent>

          <TabsContent className='mt-0' value='current'>
            <CurrentGameinfoSource
              isAnalyzing={isAnalyzing}
              onAnalyze={onAnalyze}
            />
          </TabsContent>
        </>
      ) : (
        <HandedOverSource
          context={context}
          onChangeSource={onShowTabs}
          source={initialSource}
        />
      )}

      {report && (
        <VariantPicker
          disabled={isAnalyzing}
          onPick={onPickVariant}
          title={t("performance.import.variants.title")}
          value={report.selectedVariant}
          variants={report.variants}
        />
      )}
    </div>
  );
};
