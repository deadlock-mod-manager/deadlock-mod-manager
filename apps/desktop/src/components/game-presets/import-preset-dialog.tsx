import { ChevronLeft, ChevronRight, FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ExtractedConVar, ImportStep } from "@/types/game-presets";
import { SyntaxHighlighter } from "./syntax-highlighter";

type ImportPresetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (convars: ExtractedConVar[], presetName: string) => void;
};

const extractConVarsFromGameInfo = (content: string): ExtractedConVar[] => {
  const convars: ExtractedConVar[] = [];
  const lines = content.split("\n");
  let inConVars = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes("convars") || trimmed.includes("ConVars")) {
      inConVars = true;
      continue;
    }

    if (inConVars) {
      if (trimmed === "}") {
        inConVars = false;
        continue;
      }

      const match = trimmed.match(/^"?([a-zA-Z0-9_]+)"?\s+"?([^"]+)"?$/);
      if (match) {
        convars.push({
          key: match[1],
          value: match[2].replace(/"/g, ""),
        });
      }
    }
  }

  if (convars.length === 0) {
    throw new Error("No ConVars found in file");
  }

  return convars;
};

export const ImportPresetDialog = ({
  open,
  onOpenChange,
  onImport,
}: ImportPresetDialogProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [extractedConVars, setExtractedConVars] = useState<ExtractedConVar[]>(
    [],
  );
  const [presetName, setPresetName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const content = await file.text();
    setFileContent(content);
    setPresetName(file.name.replace(/\.(gi|txt)$/, ""));
  };

  const handleNext = () => {
    if (step === "upload" && fileContent) {
      try {
        const convars = extractConVarsFromGameInfo(fileContent);
        setExtractedConVars(convars);
        setParseError(null);
        setStep("preview");
      } catch (error) {
        setParseError(
          error instanceof Error ? error.message : "Failed to parse file",
        );
      }
    } else if (step === "preview") {
      setStep("confirm");
    }
  };

  const handleBack = () => {
    if (step === "preview") {
      setStep("upload");
    } else if (step === "confirm") {
      setStep("preview");
    }
  };

  const handleImport = () => {
    onImport(extractedConVars, presetName);
    handleClose();
  };

  const handleClose = () => {
    setStep("upload");
    setFileContent("");
    setFileName("");
    setExtractedConVars([]);
    setPresetName("");
    setParseError(null);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className='flex max-h-[80vh] max-w-4xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>
            {t("gamePresets.importPreset")} -{" "}
            {t(
              `gamePresets.step${step.charAt(0).toUpperCase() + step.slice(1)}`,
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && t("gamePresets.importStepUploadDesc")}
            {step === "preview" && t("gamePresets.importStepPreviewDesc")}
            {step === "confirm" && t("gamePresets.importStepConfirmDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-auto'>
          {step === "upload" && (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='import-file'>
                  {t("gamePresets.selectFile")}
                </Label>
                <div
                  className={cn(
                    "relative flex h-48 w-full cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors",
                    fileName
                      ? "border-primary bg-muted/50"
                      : "hover:bg-muted/40",
                  )}
                  onClick={() =>
                    document.getElementById("import-file")?.click()
                  }>
                  <input
                    accept='.gi,.txt'
                    className='hidden'
                    id='import-file'
                    onChange={handleFileSelect}
                    type='file'
                  />
                  <div className='pointer-events-none text-center'>
                    {fileName ? (
                      <>
                        <FileUp className='mx-auto h-8 w-8 text-primary' />
                        <div className='mt-2 font-medium text-sm'>
                          {fileName}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {t("gamePresets.clickToChange")}
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className='mx-auto h-8 w-8' />
                        <div className='mt-2 font-medium text-sm'>
                          {t("gamePresets.dropOrClick")}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {t("gamePresets.supportedFormats")}: .gi, .txt
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {parseError && (
                <div className='rounded-md border border-destructive bg-destructive/10 p-3'>
                  <p className='text-destructive text-sm'>{parseError}</p>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label>{t("gamePresets.filePreview")}</Label>
                <div className='max-h-96 overflow-auto'>
                  <SyntaxHighlighter code={fileContent} />
                </div>
              </div>
              <div className='rounded-md border border-primary/50 bg-primary/10 p-3'>
                <p className='text-sm'>
                  {t("gamePresets.foundConVars", {
                    count: extractedConVars.length,
                  })}
                </p>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='preset-name-import'>
                  {t("gamePresets.presetName")}
                </Label>
                <Input
                  id='preset-name-import'
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t("gamePresets.presetNamePlaceholder")}
                  value={presetName}
                />
              </div>
              <div className='space-y-2'>
                <Label>{t("gamePresets.extractedConVars")}</Label>
                <div className='max-h-96 overflow-auto rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("gamePresets.varName")}</TableHead>
                        <TableHead>{t("gamePresets.value")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractedConVars.map((convar, index) => (
                        <TableRow key={`${convar.key}-${index}`}>
                          <TableCell className='font-mono text-sm'>
                            {convar.key}
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            {convar.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className='flex-row justify-between gap-2'>
          <div>
            {step !== "upload" && (
              <Button onClick={handleBack} variant='outline'>
                <ChevronLeft className='mr-1 h-4 w-4' />
                {t("common.back")}
              </Button>
            )}
          </div>
          <div className='flex gap-2'>
            <Button onClick={handleClose} variant='outline'>
              {t("common.cancel")}
            </Button>
            {step === "confirm" ? (
              <Button disabled={!presetName.trim()} onClick={handleImport}>
                {t("gamePresets.importAction")}
              </Button>
            ) : (
              <Button
                disabled={step === "upload" && !fileContent}
                onClick={handleNext}>
                {t("common.next")}
                <ChevronRight className='ml-1 h-4 w-4' />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

