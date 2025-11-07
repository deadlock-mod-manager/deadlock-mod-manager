import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ChevronDown,
  ChevronUp,
  FileIcon,
  Upload,
} from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fileToBytes, writeFileBytes } from "@/lib/file-utils";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface VpkReplacementSectionProps {
  mod: LocalMod;
  onSuccess?: () => void;
}

export const VpkReplacementSection = ({
  mod,
  onSuccess,
}: VpkReplacementSectionProps) => {
  const { t } = useTranslation();
  const { getActiveProfile } = usePersistedStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVpks, setSelectedVpks] = useState<Set<string>>(new Set());

  // Use remoteId for downloaded mods, or id for local mods
  const modIdentifier = mod.remoteId || mod.id;

  const currentVpks = mod.installedVpks?.length
    ? mod.installedVpks
    : modIdentifier
      ? [`${modIdentifier}_*.vpk`]
      : [];

  const hasMultipleVpks = currentVpks.length > 1;

  const handleFileSelect = async () => {
    try {
      const selected = await openDialog({
        multiple: hasMultipleVpks,
        filters: [
          {
            name: "VPK Files",
            extensions: ["vpk"],
          },
        ],
      });

      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      await handleVpkReplacement(files);
    } catch (error) {
      console.error("Failed to select files:", error);
      toast.error(t("modDetail.vpkReplacement.error"));
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const vpkFiles = files.filter((f) => f.name.endsWith(".vpk"));

    if (vpkFiles.length === 0) {
      toast.error(t("modDetail.vpkReplacement.error"));
      return;
    }

    try {
      // Write dropped files to temp location and get their paths
      const tempPaths: string[] = [];
      for (const file of vpkFiles) {
        const tempPath = await join(
          "temp",
          `vpk-replace-${Date.now()}-${file.name}`,
        );
        await writeFileBytes(tempPath, await fileToBytes(file));
        tempPaths.push(tempPath);
      }

      await handleVpkReplacement(tempPaths);
    } catch (error) {
      console.error("Failed to process dropped files:", error);
      toast.error(t("modDetail.vpkReplacement.error"));
    }
  };

  const handleVpkReplacement = async (paths: string[]) => {
    if (!modIdentifier) {
      toast.error(t("modDetail.vpkReplacement.error"));
      return;
    }

    // If mod has multiple VPKs and user selected specific ones
    if (hasMultipleVpks && selectedVpks.size > 0) {
      if (paths.length !== selectedVpks.size) {
        toast.error(
          t("modDetail.vpkReplacement.error") +
            `: Expected ${selectedVpks.size} files, got ${paths.length}`,
        );
        return;
      }
    } else if (hasMultipleVpks && selectedVpks.size === 0) {
      // Replace all
      if (paths.length !== currentVpks.length) {
        toast.error(
          t("modDetail.vpkReplacement.error") +
            `: Expected ${currentVpks.length} files, got ${paths.length}`,
        );
        return;
      }
    } else {
      // Single VPK
      if (paths.length !== 1) {
        toast.error(`${t("modDetail.vpkReplacement.error")}: Expected 1 file`);
        return;
      }
    }

    setIsReplacing(true);

    try {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      await invoke("replace_mod_vpks", {
        modId: modIdentifier,
        sourceVpkPaths: paths,
        installedVpks: mod.installedVpks || null,
        profileFolder,
      });

      toast.success(t("modDetail.vpkReplacement.success"));
      setSelectedVpks(new Set());
      onSuccess?.();
    } catch (error) {
      console.error("Failed to replace VPK files:", error);
      const errorMessage =
        typeof error === "string"
          ? error
          : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : JSON.stringify(error);
      toast.error(`${t("modDetail.vpkReplacement.error")}: ${errorMessage}`);
    } finally {
      setIsReplacing(false);
    }
  };

  const toggleVpkSelection = (vpk: string) => {
    const newSelection = new Set(selectedVpks);
    if (newSelection.has(vpk)) {
      newSelection.delete(vpk);
    } else {
      newSelection.add(vpk);
    }
    setSelectedVpks(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedVpks.size === currentVpks.length) {
      setSelectedVpks(new Set());
    } else {
      setSelectedVpks(new Set(currentVpks));
    }
  };

  if (currentVpks.length === 0) {
    return null;
  }

  return (
    <Card>
      <button
        type='button'
        className='w-full cursor-pointer border-border p-4 text-left transition-colors hover:bg-muted/50'
        onClick={() => setIsExpanded(!isExpanded)}>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <h3 className='font-semibold text-lg'>
              {t("modDetail.vpkReplacement.title")}
            </h3>
            <p className='text-muted-foreground text-sm'>
              {t("modDetail.vpkReplacement.description")}
            </p>
          </div>
          {isExpanded ? (
            <ChevronUp className='h-5 w-5 text-muted-foreground' />
          ) : (
            <ChevronDown className='h-5 w-5 text-muted-foreground' />
          )}
        </div>
      </button>

      {isExpanded && (
        <CardContent className='space-y-4 border-t pt-4'>
          <div className='space-y-2'>
            <Label className='font-medium text-sm'>
              {t("modDetail.vpkReplacement.currentFiles")}
            </Label>
            <div className='space-y-2'>
              {hasMultipleVpks ? (
                <>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      checked={selectedVpks.size === currentVpks.length}
                      onCheckedChange={toggleSelectAll}
                      id='select-all'
                    />
                    <Label
                      htmlFor='select-all'
                      className='cursor-pointer font-medium text-sm'>
                      {t("modDetail.vpkReplacement.replaceAll")}
                    </Label>
                  </div>
                  {currentVpks.map((vpk) => (
                    <div key={vpk} className='flex items-center gap-2 pl-6'>
                      <Checkbox
                        checked={selectedVpks.has(vpk)}
                        onCheckedChange={() => toggleVpkSelection(vpk)}
                        id={`vpk-${vpk}`}
                      />
                      <Label
                        htmlFor={`vpk-${vpk}`}
                        className='flex cursor-pointer items-center gap-2 text-sm'>
                        <FileIcon className='h-4 w-4 text-muted-foreground' />
                        {vpk}
                      </Label>
                    </div>
                  ))}
                </>
              ) : (
                <div className='flex items-center gap-2'>
                  <FileIcon className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm'>{currentVpks[0]}</span>
                </div>
              )}
            </div>
          </div>

          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}>
            <Upload className='mx-auto mb-4 h-12 w-12 text-muted-foreground' />
            <p className='mb-2 font-medium'>
              {t("modDetail.vpkReplacement.dragAndDrop")}
            </p>
            <p className='mb-4 text-muted-foreground text-sm'>
              {hasMultipleVpks && selectedVpks.size > 0
                ? t("modDetail.vpkReplacement.selectToReplace", {
                    count: selectedVpks.size,
                  })
                : hasMultipleVpks
                  ? t("modDetail.vpkReplacement.selectToReplace", {
                      count: currentVpks.length,
                    })
                  : t("modDetail.vpkReplacement.selectFiles")}
            </p>
            <Button
              onClick={handleFileSelect}
              disabled={isReplacing}
              isLoading={isReplacing}
              variant='outline'>
              {t("modDetail.vpkReplacement.selectFiles")}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
