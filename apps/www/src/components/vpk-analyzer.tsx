import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { client } from '@/utils/orpc';

type VpkAnalysisResult = Awaited<ReturnType<typeof client.analyseVPK>>;

export function VpkAnalyzer() {
  const [analysisResult, setAnalysisResult] =
    useState<VpkAnalysisResult | null>(null);

  const analyzeVpkMutation = useMutation({
    mutationFn: async (file: File) => {
      const result = await client.analyseVPK({ vpk: file });
      return result as VpkAnalysisResult;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      if (data.matchedVpk?.mod) {
        toast.success(`Matched mod: ${data.matchedVpk.mod.name}`);
      } else {
        toast.info('No matching mod found in database');
      }
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        if (!file.name.endsWith('.vpk')) {
          toast.error('Please upload a .vpk file');
          return;
        }
        analyzeVpkMutation.mutate(file);
      }
    },
    [analyzeVpkMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/octet-stream': ['.vpk'],
    },
    multiple: false,
  });

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload VPK File</CardTitle>
          <CardDescription>
            Drop a .vpk file here or click to select one
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }
              ${analyzeVpkMutation.isPending ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg
                  className="h-6 w-6 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
              </div>
              {analyzeVpkMutation.isPending ? (
                <div>
                  <p className="font-medium text-sm">Analyzing VPK file...</p>
                  <p className="text-muted-foreground text-sm">
                    This may take a few moments
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-sm">
                    {isDragActive ? 'Drop the file here' : 'Drop VPK file here'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    or click to browse files
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Information about the uploaded VPK file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="mb-3 font-semibold text-lg">VPK Information</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">
                      Version:
                    </span>
                    <span className="text-sm">
                      {analysisResult.vpk.version}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">
                      File Count:
                    </span>
                    <span className="text-sm">
                      {analysisResult.vpk.fingerprint.fileCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">
                      File Size:
                    </span>
                    <span className="text-sm">
                      {formatFileSize(analysisResult.vpk.fingerprint.fileSize)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">
                      Has Multiparts:
                    </span>
                    <Badge
                      variant={
                        analysisResult.vpk.fingerprint.hasMultiparts
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {analysisResult.vpk.fingerprint.hasMultiparts
                        ? 'Yes'
                        : 'No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">
                      Has Inline Data:
                    </span>
                    <Badge
                      variant={
                        analysisResult.vpk.fingerprint.hasInlineData
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {analysisResult.vpk.fingerprint.hasInlineData
                        ? 'Yes'
                        : 'No'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Mod Match Information */}
            {analysisResult.matchedVpk?.mod && analysisResult.match ? (
              <div>
                <h3 className="mb-3 font-semibold text-lg">Matched Mod</h3>
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-semibold text-xl">
                            {analysisResult.matchedVpk.mod.name}
                          </h4>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {analysisResult.matchedVpk.mod.category}
                            </Badge>
                            <Badge variant="secondary">
                              by {analysisResult.matchedVpk.mod.author}
                            </Badge>
                            {analysisResult.matchedVpk.mod.isAudio && (
                              <Badge variant="outline">Audio Mod</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge
                            className="text-xs"
                            variant={
                              analysisResult.match.certainty === 100
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {analysisResult.match.certainty}% match (
                            {analysisResult.match.matchType})
                          </Badge>
                        </div>
                      </div>

                      {analysisResult.matchedVpk.mod.images &&
                        analysisResult.matchedVpk.mod.images.length > 0 && (
                          <div className="relative aspect-video overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                            <img
                              alt={`${analysisResult.matchedVpk.mod.name} preview`}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback =
                                  target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                              src={analysisResult.matchedVpk.mod.images[0]}
                            />
                            <div
                              className="absolute inset-0 flex items-center justify-center"
                              style={{ display: 'none' }}
                            >
                              <div className="text-center">
                                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                  <span className="text-lg text-muted-foreground">
                                    📷
                                  </span>
                                </div>
                                <p className="text-muted-foreground text-sm">
                                  Image failed to load
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-sm">
                            Downloads
                          </span>
                          <p className="font-medium">
                            {analysisResult.matchedVpk.mod.downloadCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-sm">
                            Likes
                          </span>
                          <p className="font-medium">
                            {analysisResult.matchedVpk.mod.likes}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-sm">
                            Created
                          </span>
                          <p className="font-medium text-sm">
                            {new Date(
                              analysisResult.matchedVpk.mod.remoteAddedAt
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button asChild>
                          <a
                            href={analysisResult.matchedVpk.mod.remoteUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            View on GameBanana
                          </a>
                        </Button>
                        {analysisResult.matchedVpk.mod.audioUrl && (
                          <Button asChild variant="outline">
                            <a
                              href={analysisResult.matchedVpk.mod.audioUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
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
                <h3 className="mb-3 font-semibold text-lg">No Match Found</h3>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground">
                      This VPK file doesn't match any mods in our database. It
                      might be:
                    </p>
                    <ul className="mt-2 ml-4 list-disc space-y-1 text-muted-foreground text-sm">
                      <li>A custom mod not available on GameBanana</li>
                      <li>A modified version of an existing mod</li>
                      <li>A new mod that hasn't been indexed yet</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            <div>
              <h3 className="mb-3 font-semibold text-lg">File Contents</h3>
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-64 overflow-y-auto">
                    <div className="space-y-1">
                      {analysisResult.vpk.entries.slice(0, 20).map((entry) => (
                        <div
                          className="flex items-center gap-2 border-b px-4 py-2 text-sm last:border-b-0"
                          key={`${entry.fullPath}-${entry.crc32Hex}`}
                        >
                          <span className="flex-1 font-mono text-xs">
                            {entry.fullPath}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {formatFileSize(entry.entryLength)}
                          </span>
                        </div>
                      ))}
                      {analysisResult.vpk.entries.length > 20 && (
                        <div className="px-4 py-2 text-center text-muted-foreground text-sm">
                          ... and {analysisResult.vpk.entries.length - 20} more
                          files
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
