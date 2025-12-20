import { Button } from "@deadlock-mods/ui/components/button";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
import {
  Archive,
  Clock,
  FolderOpen,
  HardDrives,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { RestoreBackupDialog } from "@/components/settings/restore-backup-dialog";
import logger from "@/lib/logger";
import type { AddonsBackup, RestoreStrategy } from "@/types/backup";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
};

interface BackupProgress {
  stage: string;
  progress: number;
  message: string;
  vpk_count?: number;
  filename?: string;
}

export const AddonsBackupManagement = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<AddonsBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(
    null,
  );

  const loadBackups = useCallback(async () => {
    try {
      setLoading(true);
      const backupList = await invoke<AddonsBackup[]>("list_addons_backups");
      setBackups(backupList);
      logger.withMetadata({ count: backupList.length }).info("Loaded backups");
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to load backups");
      toast.error(t("settings.backupDeleteFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupProgressListener = async () => {
      unlisten = await listen<BackupProgress>("backup-progress", (event) => {
        setBackupProgress(event.payload);

        if (event.payload.stage === "completed") {
          setCreating(false);
          setBackupProgress(null);
          toast.success(t("settings.backupCreated"));
          loadBackups();
        }
      });
    };

    setupProgressListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [t, loadBackups]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      setBackupProgress(null);
      const backup = await invoke<AddonsBackup>("create_addons_backup");
      logger.withMetadata({ backup }).info("Backup created");
      // Progress completion is handled by the event listener
    } catch (error) {
      setCreating(false);
      setBackupProgress(null);
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to create backup");
      toast.error(t("settings.backupCreationFailed"));
    }
  };

  const handleRestoreBackup = (fileName: string) => {
    setSelectedBackup(fileName);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = async (strategy: RestoreStrategy) => {
    if (!selectedBackup) return;

    try {
      toast.loading(t("settings.restoringBackup"));
      await invoke("restore_addons_backup", {
        fileName: selectedBackup,
        strategy,
      });
      toast.dismiss();
      toast.success(t("settings.backupRestored"));
      logger
        .withMetadata({ fileName: selectedBackup, strategy })
        .info("Backup restored");
    } catch (error) {
      toast.dismiss();
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to restore backup");
      toast.error(t("settings.backupRestoreFailed"));
    } finally {
      setSelectedBackup(null);
    }
  };

  const handleDeleteBackup = async (fileName: string) => {
    const confirmed = await confirm(t("settings.deleteBackupConfirm"));
    if (!confirmed) return;

    try {
      await invoke("delete_addons_backup", { fileName });
      toast.success(t("settings.backupDeleted"));
      logger.withMetadata({ fileName }).info("Backup deleted");
      await loadBackups();
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to delete backup");
      toast.error(t("settings.backupDeleteFailed"));
    }
  };

  const handleOpenBackupsFolder = async () => {
    try {
      await invoke("open_addons_backups_folder");
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to open backups folder");
      toast.error(t("settings.failedToOpenFolder"));
    }
  };

  const totalSize = backups.reduce((sum, backup) => sum + backup.file_size, 0);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <Button
            disabled={creating}
            onClick={handleCreateBackup}
            variant='default'>
            <PlusIcon className='h-4 w-4' />
            {t("settings.createBackup")}
          </Button>
          <Button onClick={handleOpenBackupsFolder} variant='outline'>
            <FolderOpen className='h-4 w-4' />
            {t("settings.openBackupsFolder")}
          </Button>
        </div>
        {backups.length > 0 && (
          <div className='text-muted-foreground text-sm'>
            {backups.length} backup{backups.length !== 1 ? "s" : ""} •{" "}
            {formatFileSize(totalSize)} total
          </div>
        )}
      </div>

      {backupProgress && (
        <div className='space-y-2 rounded-lg border bg-card p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>
              {backupProgress.message.startsWith("settings.")
                ? t(backupProgress.message.replace("settings.", ""))
                : backupProgress.message}
              {backupProgress.vpk_count &&
                ` (${backupProgress.vpk_count} VPK files)`}
              {backupProgress.filename && `: ${backupProgress.filename}`}
            </span>
            <span className='text-muted-foreground text-sm'>
              {backupProgress.progress}%
            </span>
          </div>
          <Progress value={backupProgress.progress} className='h-2' />
        </div>
      )}

      {loading ? (
        <div className='flex items-center justify-center py-8'>
          <div className='text-muted-foreground'>{t("common.loading")}...</div>
        </div>
      ) : backups.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-12'>
          <Archive className='h-12 w-12 text-muted-foreground mb-4' />
          <p className='text-muted-foreground'>
            {t("settings.noBackupsFound")}
          </p>
        </div>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className='flex items-center gap-2'>
                    <Clock className='h-4 w-4' />
                    {t("settings.backupDate")}
                  </div>
                </TableHead>
                <TableHead>
                  <div className='flex items-center gap-2'>
                    <HardDrives className='h-4 w-4' />
                    {t("settings.backupSize")}
                  </div>
                </TableHead>
                <TableHead>
                  <div className='flex items-center gap-2'>
                    <Archive className='h-4 w-4' />
                    {t("settings.backupVpkCount")}
                  </div>
                </TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.file_name}>
                  <TableCell className='font-medium'>
                    {formatDate(backup.created_at)}
                  </TableCell>
                  <TableCell>{formatFileSize(backup.file_size)}</TableCell>
                  <TableCell>{backup.addons_count}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => handleRestoreBackup(backup.file_name)}>
                        {t("settings.restoreBackup")}
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => handleDeleteBackup(backup.file_name)}>
                        <TrashIcon className='h-4 w-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedBackup && (
        <RestoreBackupDialog
          backupFileName={selectedBackup}
          onConfirm={handleConfirmRestore}
          onOpenChange={setRestoreDialogOpen}
          open={restoreDialogOpen}
        />
      )}
    </div>
  );
};
