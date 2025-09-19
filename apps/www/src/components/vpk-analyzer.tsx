import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { client } from "@/utils/orpc";
import { Progress } from "./ui/progress";

type VpkAnalysisResult = Awaited<ReturnType<typeof client.analyseVPK>>;

interface FileAnalysisState {
  file: File;
  result: VpkAnalysisResult | null;
  status: "pending" | "analyzing" | "completed" | "error";
  error?: string;
}

export function VpkAnalyzer() {
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysisState[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

        if (result.matchedVpk?.mod) {
          toast.success(
            `${fileState.file.name}: Matched mod "${result.matchedVpk.mod.name}"`,
          );
        } else {
          toast.info(`${fileState.file.name}: No matching mod found`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Update with error
        updateFileState(index, {
          status: "error" as const,
          error: errorMessage,
        });

        toast.error(
          `${fileState.file.name}: Analysis failed - ${errorMessage}`,
        );
      }
    },
    [updateFileState],
  );

  const analyzeAllFiles = useCallback(
    async (files: FileAnalysisState[]) => {
      setIsAnalyzing(true);

      try {
        const analysisPromises = files.map((file, index) =>
          analyzeFile(file, index),
        );

        await Promise.allSettled(analysisPromises);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzeFile],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const vpkFiles = acceptedFiles.filter((file) =>
        file.name.endsWith(".vpk"),
      );

      if (vpkFiles.length === 0) {
        toast.error("Please upload .vpk files only");
        return;
      }

      if (vpkFiles.length !== acceptedFiles.length) {
        toast.warning(
          `${acceptedFiles.length - vpkFiles.length} non-VPK files were ignored`,
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
    [analyzeAllFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/octet-stream": [".vpk"],
    },
    multiple: true,
  });

  const formatFileSize = (bytes: number) => {
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
          <CardTitle>Upload VPK Files</CardTitle>
          <CardDescription>
            Drop multiple .vpk files here or click to select them
          </CardDescription>
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
                  <p className='font-medium text-sm'>Analyzing VPK files...</p>
                  <p className='text-muted-foreground text-sm'>
                    {analyzingCount > 0
                      ? `Processing ${analyzingCount} of ${totalFiles} files`
                      : "Preparing analysis..."}
                  </p>
                  {totalFiles > 0 && (
                    <div className='mx-auto w-3/4'>
                      <Progress className='h-1' value={progressPercentage} />
                      <p className='mt-1 text-muted-foreground text-xs'>
                        {Math.round(progressPercentage)}% complete
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className='font-medium text-sm'>
                    {isDragActive
                      ? "Drop the files here"
                      : "Drop VPK files here"}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    or click to browse files (supports multiple files)
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
            <h2 className='font-semibold text-xl'>Analysis Results</h2>
            <Badge variant='secondary'>
              {completedAnalyses.length} / {totalFiles} completed
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
                    {fileAnalysis.status === "analyzing"
                      ? "Analyzing..."
                      : fileAnalysis.status === "completed"
                        ? "Completed"
                        : fileAnalysis.status === "error"
                          ? "Error"
                          : "Pending"}
                  </Badge>
                </div>
              </CardHeader>

              {fileAnalysis.status === "error" && (
                <CardContent>
                  <div className='rounded-lg border border-destructive/20 bg-destructive/5 p-4'>
                    <p className='text-destructive text-sm'>
                      Analysis failed: {fileAnalysis.error}
                    </p>
                  </div>
                </CardContent>
              )}

              {fileAnalysis.result && (
                <CardContent className='space-y-6'>
                  <div>
                    <h3 className='mb-3 font-semibold text-lg'>
                      VPK Information
                    </h3>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            Version:
                          </span>
                          <span className='text-sm'>
                            {fileAnalysis.result.vpk.version}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            File Count:
                          </span>
                          <span className='text-sm'>
                            {fileAnalysis.result.vpk.fingerprint.fileCount}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            File Size:
                          </span>
                          <span className='text-sm'>
                            {formatFileSize(
                              fileAnalysis.result.vpk.fingerprint.fileSize,
                            )}
                          </span>
                        </div>
                      </div>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            Has Multiparts:
                          </span>
                          <Badge
                            variant={
                              fileAnalysis.result.vpk.fingerprint.hasMultiparts
                                ? "default"
                                : "secondary"
                            }>
                            {fileAnalysis.result.vpk.fingerprint.hasMultiparts
                              ? "Yes"
                              : "No"}
                          </Badge>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-muted-foreground text-sm'>
                            Has Inline Data:
                          </span>
                          <Badge
                            variant={
                              fileAnalysis.result.vpk.fingerprint.hasInlineData
                                ? "default"
                                : "secondary"
                            }>
                            {fileAnalysis.result.vpk.fingerprint.hasInlineData
                              ? "Yes"
                              : "No"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mod Match Information */}
                  {fileAnalysis.result.matchedVpk?.mod &&
                  fileAnalysis.result.match ? (
                    <div>
                      <h3 className='mb-3 font-semibold text-lg'>
                        Matched Mod
                      </h3>
                      <Card>
                        <CardContent className='pt-6'>
                          <div className='space-y-4'>
                            <div className='flex items-start justify-between'>
                              <div className='space-y-1'>
                                <h4 className='font-semibold text-xl'>
                                  {fileAnalysis.result.matchedVpk.mod.name}
                                </h4>
                                <div className='flex items-center gap-2'>
                                  <Badge variant='outline'>
                                    {
                                      fileAnalysis.result.matchedVpk.mod
                                        .category
                                    }
                                  </Badge>
                                  <Badge variant='secondary'>
                                    by{" "}
                                    {fileAnalysis.result.matchedVpk.mod.author}
                                  </Badge>
                                  {fileAnalysis.result.matchedVpk.mod
                                    .isAudio && (
                                    <Badge variant='outline'>Audio Mod</Badge>
                                  )}
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
                                  {fileAnalysis.result.match.certainty}% match (
                                  {fileAnalysis.result.match.matchType})
                                </Badge>
                              </div>
                            </div>

                            {fileAnalysis.result.matchedVpk.mod.images &&
                              fileAnalysis.result.matchedVpk.mod.images.length >
                                0 && (
                                <div className='relative aspect-video overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10'>
                                  <img
                                    alt={`${fileAnalysis.result.matchedVpk.mod.name} preview`}
                                    className='h-full w-full object-cover'
                                    onError={(e) => {
                                      const target =
                                        e.target as HTMLImageElement;
                                      target.style.display = "none";
                                      const fallback =
                                        target.nextElementSibling as HTMLElement;
                                      if (fallback)
                                        fallback.style.display = "flex";
                                    }}
                                    src={
                                      fileAnalysis.result.matchedVpk.mod
                                        .images[0]
                                    }
                                  />
                                  <div
                                    className='absolute inset-0 flex items-center justify-center'
                                    style={{ display: "none" }}>
                                    <div className='text-center'>
                                      <div className='mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
                                        <span className='text-lg text-muted-foreground'>
                                          📷
                                        </span>
                                      </div>
                                      <p className='text-muted-foreground text-sm'>
                                        Image failed to load
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                              <div className='space-y-1'>
                                <span className='text-muted-foreground text-sm'>
                                  Downloads
                                </span>
                                <p className='font-medium'>
                                  {fileAnalysis.result.matchedVpk.mod.downloadCount.toLocaleString()}
                                </p>
                              </div>
                              <div className='space-y-1'>
                                <span className='text-muted-foreground text-sm'>
                                  Likes
                                </span>
                                <p className='font-medium'>
                                  {fileAnalysis.result.matchedVpk.mod.likes}
                                </p>
                              </div>
                              <div className='space-y-1'>
                                <span className='text-muted-foreground text-sm'>
                                  Created
                                </span>
                                <p className='font-medium text-sm'>
                                  {new Date(
                                    fileAnalysis.result.matchedVpk.mod
                                      .remoteAddedAt,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <div className='flex gap-2 pt-2'>
                              <Button asChild>
                                <a
                                  href={
                                    fileAnalysis.result.matchedVpk.mod.remoteUrl
                                  }
                                  rel='noopener noreferrer'
                                  target='_blank'>
                                  View on GameBanana
                                </a>
                              </Button>
                              {fileAnalysis.result.matchedVpk.mod.audioUrl && (
                                <Button asChild variant='outline'>
                                  <a
                                    href={
                                      fileAnalysis.result.matchedVpk.mod
                                        .audioUrl
                                    }
                                    rel='noopener noreferrer'
                                    target='_blank'>
                                    Preview Audio
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <div>
                      <h3 className='mb-3 font-semibold text-lg'>
                        No Match Found
                      </h3>
                      <Card>
                        <CardContent className='pt-6'>
                          <p className='text-muted-foreground'>
                            This VPK file doesn't match any mods in our
                            database. It might be:
                          </p>
                          <ul className='mt-2 ml-4 list-disc space-y-1 text-muted-foreground text-sm'>
                            <li>A custom mod not available on GameBanana</li>
                            <li>A modified version of an existing mod</li>
                            <li>A new mod that hasn't been indexed yet</li>
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div>
                    <h3 className='mb-3 font-semibold text-lg'>
                      File Contents
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
                                ... and{" "}
                                {fileAnalysis.result.vpk.entries.length - 20}{" "}
                                more files
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
