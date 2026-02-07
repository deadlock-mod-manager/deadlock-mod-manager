import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Edit,
  FileCheck,
  RefreshCcw,
  RotateCcw,
  Shield,
} from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";

type GameInfoStatus = {
  current_hash: string;
  is_modified_by_mod_manager: boolean;
  is_modified_externally: boolean;
  backup_exists: boolean;
  backup_valid: boolean;
  syntax_valid: boolean;
  has_mod_paths: boolean;
};

const GameInfoManagement = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [isOperating, setIsOperating] = useState(false);

  const { data: status, refetch } = useQuery<GameInfoStatus>({
    queryKey: ["gameinfo-status"],
    queryFn: () => invoke("get_gameinfo_status"),
    refetchInterval: 5000,
  });

  const statusInfo = useMemo(() => {
    if (!status) {
      return null;
    }

    const items = [
      {
        label: "Syntax",
        value: status.syntax_valid ? "Valid" : "Invalid",
        color: status.syntax_valid ? "success" : "destructive",
        icon: status.syntax_valid ? CheckCircle : AlertTriangle,
      },
      {
        label: "Backup",
        value: status.backup_exists
          ? status.backup_valid
            ? "Valid"
            : "Invalid"
          : "None",
        color: status.backup_exists
          ? status.backup_valid
            ? "success"
            : "warning"
          : "secondary",
        icon: status.backup_exists ? Shield : Database,
      },
      {
        label: "Modifications",
        value: status.is_modified_by_mod_manager
          ? "Mod Manager"
          : status.is_modified_externally
            ? "External"
            : "None",
        color: status.is_modified_by_mod_manager
          ? "default"
          : status.is_modified_externally
            ? "warning"
            : "success",
        icon: status.has_mod_paths ? FileCheck : CheckCircle,
      },
    ];

    return items;
  }, [status]);

  const handleBackupGameInfo = async () => {
    try {
      setIsOperating(true);
      await invoke("backup_gameinfo");
      await refetch();
      toast.success(t("game.backupCreatedSuccess"));
    } catch (error) {
      toast.error(`Failed to create backup: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!(await confirm(t("game.confirmRestore")))) {
      return;
    }

    try {
      setIsOperating(true);
      await invoke("restore_gameinfo_backup");
      await refetch();
      toast.success(t("game.restoreSuccess"));
    } catch (error) {
      toast.error(`Failed to restore backup: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleResetToVanilla = async () => {
    if (!(await confirm(t("game.confirmReset")))) {
      return;
    }

    try {
      setIsOperating(true);
      await invoke("reset_to_vanilla");
      await refetch();
      toast.success(t("game.resetSuccess"));
    } catch (error) {
      toast.error(`Failed to reset to vanilla: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleValidatePatch = async () => {
    try {
      setIsOperating(true);
      const isVanilla = !status?.has_mod_paths;
      await invoke("validate_gameinfo_patch", { expectedVanilla: isVanilla });
      await refetch();
      toast.success(t("game.validationPassed"));
    } catch (error) {
      toast.error(`Validation failed: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleOpenEditor = async () => {
    try {
      setIsOperating(true);
      await invoke("open_gameinfo_editor");
      toast.success(t("game.openedInEditor"));
    } catch (error) {
      toast.error(`Failed to open editor: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  if (!status) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center gap-4'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-6 w-24' />
          <Skeleton className='h-6 w-28' />
        </div>
        <div className='flex gap-2'>
          <Skeleton className='h-10 w-32' />
          <Skeleton className='h-10 w-32' />
          <Skeleton className='h-10 w-32' />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='rounded-lg border bg-card p-4'>
        <h4 className='mb-3 font-medium text-sm'>Current Status</h4>
        <div className='flex flex-wrap items-center gap-4'>
          {statusInfo?.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <div className='flex items-center gap-2'>
                    <Icon className='h-4 w-4' />
                    <span className='text-muted-foreground text-sm'>
                      {item.label}:
                    </span>
                    <Badge
                      variant={
                        item.color as "default" | "secondary" | "destructive"
                      }>
                      {item.value}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {item.label === "Syntax" &&
                      "Whether the gameinfo.gi file has valid syntax"}
                    {item.label === "Backup" &&
                      "Status of the backup file integrity"}
                    {item.label === "Modifications" &&
                      "How the file was last modified"}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {status.is_modified_externally && (
          <div className='mt-3 rounded-md border-yellow-500 border-l-4 bg-yellow-50 p-3 dark:bg-yellow-950/20'>
            <div className='flex items-center gap-2'>
              <AlertTriangle className='h-4 w-4 text-yellow-600' />
              <span className='font-medium text-sm text-yellow-800 dark:text-yellow-200'>
                External modification detected
              </span>
            </div>
            <p className='mt-1 text-xs text-yellow-700 dark:text-yellow-300'>
              The gameinfo.gi file has been modified by another tool. Consider
              creating a backup before making changes.
            </p>
          </div>
        )}

        {!status.backup_exists && (
          <div className='mt-3 rounded-md border-blue-500 border-l-4 bg-blue-50 p-3 dark:bg-blue-950/20'>
            <div className='flex items-center gap-2'>
              <Database className='h-4 w-4 text-blue-600' />
              <span className='font-medium text-blue-800 text-sm dark:text-blue-200'>
                No backup found
              </span>
            </div>
            <p className='mt-1 text-blue-700 text-xs dark:text-blue-300'>
              Creating a backup is recommended before making modifications.
            </p>
          </div>
        )}
      </div>

      <div className='flex flex-wrap gap-3'>
        <Button
          disabled={isOperating || status.backup_exists}
          onClick={handleBackupGameInfo}
          size='default'
          variant='outline'>
          <Database className='h-4 w-4' />
          {t("game.createBackup")}
        </Button>

        <Button
          disabled={isOperating || !status.backup_exists}
          onClick={handleRestoreBackup}
          size='default'
          variant='outline'>
          <RefreshCcw className='h-4 w-4' />
          {t("game.restoreBackup")}
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleResetToVanilla}
          size='default'
          variant='outline'>
          <RotateCcw className='h-4 w-4' />
          {t("game.resetToVanilla")}
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleValidatePatch}
          size='default'
          variant='outline'>
          <FileCheck className='h-4 w-4' />
          {t("game.validateConfiguration")}
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleOpenEditor}
          size='default'
          variant='outline'>
          <Edit className='h-4 w-4' />
          {t("game.openInEditor")}
        </Button>
      </div>

      <div className='rounded-lg border bg-muted/50 p-3'>
        <div className='flex flex-col gap-2 text-sm'>
          <div>
            <span className='text-muted-foreground'>File Hash:</span>{" "}
            <code className='font-mono'>{status.current_hash}</code>
          </div>
          <div>
            <span className='text-muted-foreground'>Mod Paths:</span>{" "}
            <span
              className={
                status.has_mod_paths ? "text-green-600" : "text-gray-500"
              }>
              {status.has_mod_paths ? "Present" : "Not Present"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameInfoManagement;
