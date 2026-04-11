import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  FileArchive,
  Globe,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { client } from "@/utils/orpc";
import type { WizardStepProps } from "../types";
import { FileTree } from "../shared/file-tree";

interface UploadStepProps extends WizardStepProps {
  onZipLoad: (file: File) => Promise<string[]>;
  zipFiles: string[];
  zipFileName: string | null;
  zipLoading: boolean;
  zipError: string | null;
  onZipReset: () => void;
  hasDraft: boolean;
  onResumeDraft: () => void;
  onClearDraft: () => void;
}

function parseGameBananaUrl(url: string): string | null {
  const match = url.match(/gamebanana\.com\/mods\/(\d+)/);
  return match ? match[1] : null;
}

export function UploadStep({
  form,
  onNext,
  onZipLoad,
  zipFiles,
  zipFileName,
  zipLoading,
  zipError,
  onZipReset,
  hasDraft,
  onResumeDraft,
  onClearDraft,
}: UploadStepProps) {
  const [gbUrl, setGbUrl] = useState("");

  const importMutation = useMutation({
    mutationFn: async (remoteId: string) => {
      return await client.getModV2({ id: remoteId });
    },
    onSuccess: (mod) => {
      form.setValue("display_name", mod.name);
      form.setValue(
        "name",
        mod.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      );
      if (mod.description) {
        form.setValue("description", mod.description);
      }
      form.setValue("authors", [mod.author]);
      if (mod.metadata?.donationLinks) {
        form.setValue(
          "homepage",
          mod.metadata.donationLinks[0]?.url ?? mod.remoteUrl,
        );
      }
      form.setValue("metadata", {
        tags: mod.tags ?? [],
        category: mod.category ?? null,
        nsfw: mod.isNSFW ?? null,
      });
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        await onZipLoad(file);
      }
    },
    [onZipLoad],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    maxFiles: 1,
    multiple: false,
  });

  const handleImport = () => {
    const remoteId = parseGameBananaUrl(gbUrl);
    if (remoteId) {
      importMutation.mutate(remoteId);
    }
  };

  return (
    <div className='space-y-6'>
      {hasDraft && !zipFileName && (
        <Card className='border-yellow-500/30 bg-yellow-500/5'>
          <CardContent className='flex items-center justify-between p-4'>
            <div className='flex items-center gap-3'>
              <RotateCcw className='h-5 w-5 text-yellow-500' />
              <div>
                <p className='font-medium text-sm'>Previous session found</p>
                <p className='text-muted-foreground text-xs'>
                  You have an unfinished mod configuration. Resume where you
                  left off?
                </p>
              </div>
            </div>
            <div className='flex gap-2'>
              <Button variant='ghost' size='sm' onClick={onClearDraft}>
                Discard
              </Button>
              <Button size='sm' onClick={onResumeDraft}>
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Upload className='h-5 w-5' />
            Upload Mod Archive
          </CardTitle>
        </CardHeader>
        <CardContent>
          {zipFileName ? (
            <div className='space-y-4'>
              <div className='flex items-center justify-between rounded-lg border bg-accent/30 p-3'>
                <div className='flex items-center gap-3'>
                  <FileArchive className='h-5 w-5 text-primary' />
                  <div>
                    <p className='font-medium text-sm'>{zipFileName}</p>
                    <p className='text-muted-foreground text-xs'>
                      {zipFiles.length} files found
                    </p>
                  </div>
                </div>
                <Button variant='ghost' size='icon' onClick={onZipReset}>
                  <X className='h-4 w-4' />
                </Button>
              </div>
              <FileTree files={zipFiles} maxHeight='200px' />
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 hover:border-muted-foreground/40",
              )}>
              <input {...getInputProps()} />
              {zipLoading ? (
                <div className='flex flex-col items-center gap-3'>
                  <Loader2 className='h-10 w-10 animate-spin text-muted-foreground' />
                  <p className='text-muted-foreground text-sm'>
                    Reading archive...
                  </p>
                </div>
              ) : (
                <div className='flex flex-col items-center gap-3'>
                  <FileArchive className='h-10 w-10 text-muted-foreground' />
                  <div>
                    <p className='font-medium text-sm'>
                      Drop your mod .zip file here, or click to browse
                    </p>
                    <p className='mt-1 text-muted-foreground text-xs'>
                      Upload the zip archive containing your mod&apos;s VPK
                      files
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {zipError && (
            <p className='mt-2 text-destructive text-sm'>{zipError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Globe className='h-5 w-5' />
            Import from GameBanana
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            Paste a GameBanana mod URL to auto-fill basic info from our
            database.
          </p>
          <div className='flex gap-2'>
            <div className='flex-1'>
              <Label htmlFor='gb-url' className='sr-only'>
                GameBanana URL
              </Label>
              <Input
                id='gb-url'
                placeholder='https://gamebanana.com/mods/12345'
                value={gbUrl}
                onChange={(e) => setGbUrl(e.target.value)}
              />
            </div>
            <Button
              onClick={handleImport}
              disabled={!parseGameBananaUrl(gbUrl) || importMutation.isPending}>
              {importMutation.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                "Import"
              )}
            </Button>
          </div>
          {importMutation.isSuccess && (
            <p className='text-green-500 text-sm'>
              Imported data from GameBanana successfully.
            </p>
          )}
          {importMutation.isError && (
            <p className='text-destructive text-sm'>
              Failed to import. Make sure the mod exists in our database. You
              can trigger a sync by visiting the mod page first.
            </p>
          )}
        </CardContent>
      </Card>

      <div className='flex justify-end'>
        <Button onClick={onNext}>
          Continue
          <ArrowRight className='ml-2 h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
