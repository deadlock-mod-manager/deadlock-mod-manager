import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { useAnalyticsContext } from "@/components/analytics-provider";
import { client } from "@/utils/orpc";

type VpkAnalysisResult = Awaited<ReturnType<typeof client.analyseVPK>>;

interface FileAnalysisState {
  file: File;
  result: VpkAnalysisResult | null;
  status: "pending" | "analyzing" | "completed" | "error";
  error?: string;
}

export function VpkAnalyzer() {
  const { t } = useTranslation("tool-vpk");
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysisState[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { analytics } = useAnalyticsContext();

  // Use a ref to store the current file analyses to avoid stale closure issues
  const fileAnalysesRef = useRef<FileAnalysisState[]>([]);
  fileAnalysesRef.current = fileAnalyses;

  const updateFileState = useCallback(
    (index: number, updates: Partial<FileAnalysisState>) => {
      setFileAnalyses((prev) => {
        const newState = [...prev];
        if (newState[index]) {
          newState[index] = { ...newState[index], ...updates };
        }
        return newState;
      });
    },
    [],
  );

  const analyzeFile = useCallback(
    async (fileState: FileAnalysisState, index: number) => {
      try {
        // Update status to analyzing
        updateFileState(index, { status: "analyzing" as const });

        const result = await client.analyseVPK({ vpk: fileState.file });

        // Update with successful result
        updateFileState(index, {
          result: result as VpkAnalysisResult,
          status: "completed" as const,
        });

        if (result.matchedVpk) {
          const slug =
            result.matchedVpk.submissionType === "sound"
              ? `snd-${result.matchedVpk.submissionId}`
              : result.matchedVpk.submissionId;
          toast.success(
            t("toasts.matched", { file: fileState.file.name, slug }),
          );
        } else {
          toast.info(t("toasts.noMatch", { file: fileState.file.name }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t("toasts.unknownError");

        // Update with error
        updateFileState(index, {
          status: "error" as const,
          error: errorMessage,
        });

        toast.error(
          t("toasts.failed", {
            file: fileState.file.name,
            error: errorMessage,
          }),
        );
      }
    },
    [updateFileState, t],
  );

  const analyzeAllFiles = useCallback(
    async (files: FileAnalysisState[]) => {
      setIsAnalyzing(true);
      const startTime = Date.now();

      // Track analysis started
      if (analytics.isEnabled) {
        analytics.trackVpkAnalysisStarted(files.length);
      }

      try {
        const analysisPromises = files.map((file, index) =>
          analyzeFile(file, index),
        );

        await Promise.allSettled(analysisPromises);

        // Track analysis completed
        if (analytics.isEnabled) {
          const endTime = Date.now();
          const durationSeconds = (endTime - startTime) / 1000;
          const identifiedCount = fileAnalysesRef.current.filter(
            (analysis) => analysis.result?.matchedVpk,
          ).length;

          analytics.trackVpkAnalysisCompleted(
            files.length,
            identifiedCount,
            durationSeconds,
          );
        }
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzeFile, analytics],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const vpkFiles = acceptedFiles.filter((file) =>
        file.name.endsWith(".vpk"),
      );

      if (vpkFiles.length === 0) {
        toast.error(t("toasts.onlyVpk"));
        return;
      }

      if (vpkFiles.length !== acceptedFiles.length) {
        toast.warning(
          t("toasts.ignored", {
            ignored: acceptedFiles.length - vpkFiles.length,
          }),
        );
      }

      // Create initial file analysis states
      const newFileAnalyses: FileAnalysisState[] = vpkFiles.map((file) => ({
        file,
        result: null,
        status: "pending" as const,
      }));

      setFileAnalyses(newFileAnalyses);
      analyzeAllFiles(newFileAnalyses);
    },
    [analyzeAllFiles, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/octet-stream": [".vpk"],
    },
    multiple: true,
  });

  const formatFileSize = (bytes: number | undefined) => {
    if (bytes === undefined || bytes === null || Number.isNaN(bytes)) {
      return t("unknownSize");
    }

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const completedAnalyses = fileAnalyses.filter(
    (f) => f.status === "completed",
  );
  const analyzingCount = fileAnalyses.filter(
    (f) => f.status === "analyzing",
  ).length;
  const totalFiles = fileAnalyses.length;
  const progressPercentage =
    totalFiles > 0
      ? ((completedAnalyses.length +
          fileAnalyses.filter((f) => f.status === "error").length) /
          totalFiles) *
        100
      : 0;

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t("upload.title")}</CardTitle>
          <CardDescription>{t("upload.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }
              ${isAnalyzing ? "pointer-events-none opacity-50" : ""}
            `}>
            <input {...getInputProps()} />
            <div className='space-y-4'>
              <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
                <svg
                  className='h-6 w-6 text-muted-foreground'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                  />
                </svg>
              </div>
              {isAnalyzing ? (
                <div className='space-y-2'>
                  <p className='font-medium text-sm'>{t("upload.analyzing")}</p>
                  <p className='text-muted-foreground text-sm'>
                    {analyzingCount > 0
                      ? t("upload.processing", {
                          current: analyzingCount,
                          total: totalFiles,
                        })
                      : t("upload.preparing")}
                  </p>
                  {totalFiles > 0 && (
                    <div className='mx-auto w-3/4'>
                      <Progress className='h-1' value={progressPercentage} />
                      <p className='mt-1 text-muted-foreground text-xs'>
                        {t("upload.progress", {
                          percent: Math.round(progressPercentage),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className='font-medium text-sm'>
                    {isDragActive ? t("upload.dropActive") : t("upload.drop")}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {t("upload.browse")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {fileAnalyses.length > 0 && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='font-semibold text-xl'>{t("results.title")}</h2>
            <Badge variant='secondary'>
              {t("results.completed", {
                completed: completedAnalyses.length,
                total: totalFiles,
              })}
            </Badge>
          </div>

          {fileAnalyses.map((fileAnalysis, index) => (
            <Card key={`${fileAnalysis.file.name}-${index}`}>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1'>
                    <CardTitle className='text-lg'>
                      {fileAnalysis.file.name}
                    </CardTitle>
                    <CardDescription>
                      {formatFileSize(fileAnalysis.file.size)}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      fileAnalysis.status === "completed"
                        ? "default"
                        : fileAnalysis.status === "analyzing"
                          ? "secondary"
                          : fileAnalysis.status === "error"
                            ? "destructive"
                            : "outline"
                    }>
                    {t(`results.status.${fileAnalysis.status}`)}
                  </Badge>
                </div>
              </CardHeader>

              {fileAnalysis.status === "error" && (
                <CardContent>
                  <div className='rounded-lg border border-destructive/20 bg-destructive/5 p-4'>
                    <p className='text-destructive text-sm'>
                      {t("results.failed", { error: fileAnalysis.error })}
                    </p>
                  </div>
                </CardContent>
              )}

              {fileAnalysis.result && (
                <CardContent className='space-y-6'>
                  <div>
                    <h3 className='mb-3 font-semibold text-lg'>
                      {t("info.title")}
                    </h3>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            {t("info.version")}
                          </span>
                          <span className='text-sm'>
                            {fileAnalysis.result.vpk.version}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            {t("info.fileCount")}
                          </span>
                          <span className='text-sm'>
                            {fileAnalysis.result.vpk.fingerprint?.fileCount ??
                              t("info.unknown")}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            {t("info.fileSize")}
                          </span>
                          <span className='text-sm'>
                            {formatFileSize(
                              fileAnalysis.result.vpk.fingerprint?.fileSize,
                            )}
                          </span>
                        </div>
                      </div>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            {t("info.hasMultiparts")}
                          </span>
                          <Badge
                            variant={
                              fileAnalysis.result.vpk.fingerprint?.hasMultiparts
                                ? "default"
                                : "secondary"
                            }>
                            {fileAnalysis.result.vpk.fingerprint?.hasMultiparts
                              ? t("info.yes")
                              : t("info.no")}
                          </Badge>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            {t("info.hasInlineData")}
                          </span>
                          <Badge
                            variant={
                              fileAnalysis.result.vpk.fingerprint?.hasInlineData
                                ? "default"
                                : "secondary"
                            }>
                            {fileAnalysis.result.vpk.fingerprint?.hasInlineData
                              ? t("info.yes")
                              : t("info.no")}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {fileAnalysis.result.matchedVpk &&
                  fileAnalysis.result.match ? (
                    <div>
                      <h3 className='mb-3 font-semibold text-lg'>
                        {t("match.title")}
                      </h3>
                      <Card>
                        <CardContent className='pt-6'>
                          <div className='space-y-4'>
                            <div className='flex items-start justify-between'>
                              <div className='space-y-1'>
                                <h4 className='font-semibold text-xl'>
                                  {t("match.heading", {
                                    type: fileAnalysis.result.matchedVpk
                                      .submissionType,
                                    id: fileAnalysis.result.matchedVpk
                                      .submissionId,
                                  })}
                                </h4>
                                <div className='flex items-center gap-2'>
                                  <Badge variant='outline'>
                                    {
                                      fileAnalysis.result.matchedVpk
                                        .submissionType
                                    }
                                  </Badge>
                                  <Badge variant='secondary'>
                                    {t("match.file", {
                                      id: fileAnalysis.result.matchedVpk.fileId,
                                    })}
                                  </Badge>
                                </div>
                              </div>
                              <div className='text-right'>
                                <Badge
                                  className='text-xs'
                                  variant={
                                    fileAnalysis.result.match.certainty === 100
                                      ? "default"
                                      : "secondary"
                                  }>
                                  {t("match.certainty", {
                                    certainty:
                                      fileAnalysis.result.match.certainty,
                                    type: fileAnalysis.result.match.matchType,
                                  })}
                                </Badge>
                              </div>
                            </div>

                            <div className='flex gap-2 pt-2'>
                              <Button asChild>
                                <a
                                  href={`https://gamebanana.com/${
                                    fileAnalysis.result.matchedVpk
                                      .submissionType === "sound"
                                      ? "sounds"
                                      : "mods"
                                  }/${fileAnalysis.result.matchedVpk.submissionId}`}
                                  rel='noopener noreferrer'
                                  target='_blank'>
                                  {t("match.view")}
                                </a>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <div>
                      <h3 className='mb-3 font-semibold text-lg'>
                        {t("noMatch.title")}
                      </h3>
                      <Card>
                        <CardContent className='pt-6'>
                          <p className='text-muted-foreground'>
                            {t("noMatch.description")}
                          </p>
                          <ul className='mt-2 ml-4 list-disc space-y-1 text-muted-foreground text-sm'>
                            {Object.entries(
                              t("noMatch.reasons", { returnObjects: true }),
                            ).map(([id, reason]) => (
                              <li key={id}>{reason}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div>
                    <h3 className='mb-3 font-semibold text-lg'>
                      {t("contents.title")}
                    </h3>
                    <Card>
                      <CardContent className='p-0'>
                        <div className='max-h-64 overflow-y-auto'>
                          <div className='space-y-1'>
                            {fileAnalysis.result.vpk.entries
                              .slice(0, 20)
                              .map((entry) => (
                                <div
                                  className='flex items-center gap-2 border-b px-4 py-2 text-sm last:border-b-0'
                                  key={`${entry.fullPath}-${entry.crc32Hex}`}>
                                  <span className='flex-1 font-mono text-xs'>
                                    {entry.fullPath}
                                  </span>
                                  <span className='text-muted-foreground text-xs'>
                                    {formatFileSize(entry.entryLength)}
                                  </span>
                                </div>
                              ))}
                            {fileAnalysis.result.vpk.entries.length > 20 && (
                              <div className='px-4 py-2 text-center text-muted-foreground text-sm'>
                                {t("contents.more", {
                                  more:
                                    fileAnalysis.result.vpk.entries.length - 20,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
