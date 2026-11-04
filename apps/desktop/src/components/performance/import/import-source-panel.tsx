import {
  fileNameFromPath,
  type ImportModContext,
  looksLikeShareCode,
} from "@/lib/performance/import/save";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";
import { Button } from "@deadlock-mods/ui/components/button";
import { TabsContent } from "@deadlock-mods/ui/components/tabs";
import { FileIcon } from "@phosphor-icons/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { type ClipboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigTextArea } from "./config-text-area";
import { CurrentGameinfoSource } from "./current-gameinfo-source";
import { GameBananaSource } from "./gamebanana-source";
import { HandedOverSource } from "./handed-over-source";
import { VariantPicker } from "./variant-picker";

const CONFIG_EXTENSIONS = ["gi", "cfg", "txt", "zip", "rar", "7z"];

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
export { ImportSourceTabList } from "./import-source-tab-list";
export {
  initialTab,
  isHandedOver,
  isSourceTab,
  type SourceTab,
} from "./source-tabs";
export { VariantPicker } from "./variant-picker";
