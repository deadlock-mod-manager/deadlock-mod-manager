import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Edit,
  FileCheck,
  RefreshCcw,
  RotateCcw,
  Shield,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import { useConfirm } from '@/components/providers/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Type definitions for the gameinfo status from Rust
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
  const confirm = useConfirm();
  const [isOperating, setIsOperating] = useState(false);

  const { data: status, refetch } = useQuery<GameInfoStatus>(
    'gameinfo-status',
    () => invoke('get_gameinfo_status'),
    {
      refetchInterval: 5000,
      onError: () => {
        toast.error('Failed to get gameinfo status');
        // Error is logged internally by react-query
      },
    }
  );

  // Status indicators
  const statusInfo = useMemo(() => {
    if (!status) {
      return null;
    }

    const items = [
      {
        label: 'Syntax',
        value: status.syntax_valid ? 'Valid' : 'Invalid',
        color: status.syntax_valid ? 'success' : 'destructive',
        icon: status.syntax_valid ? CheckCircle : AlertTriangle,
      },
      {
        label: 'Backup',
        value: status.backup_exists
          ? status.backup_valid
            ? 'Valid'
            : 'Invalid'
          : 'None',
        color: status.backup_exists
          ? status.backup_valid
            ? 'success'
            : 'warning'
          : 'secondary',
        icon: status.backup_exists ? Shield : Database,
      },
      {
        label: 'Modifications',
        value: status.is_modified_by_mod_manager
          ? 'Mod Manager'
          : status.is_modified_externally
            ? 'External'
            : 'None',
        color: status.is_modified_by_mod_manager
          ? 'default'
          : status.is_modified_externally
            ? 'warning'
            : 'success',
        icon: status.has_mod_paths ? FileCheck : CheckCircle,
      },
    ];

    return items;
  }, [status]);

  const handleBackupGameInfo = async () => {
    try {
      setIsOperating(true);
      await invoke('backup_gameinfo');
      await refetch();
      toast.success('gameinfo.gi backup created successfully');
    } catch (error) {
      toast.error(`Failed to create backup: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (
      !(await confirm(
        'Are you sure you want to restore gameinfo.gi from backup? This will overwrite the current file.'
      ))
    ) {
      return;
    }

    try {
      setIsOperating(true);
      await invoke('restore_gameinfo_backup');
      await refetch();
      toast.success('gameinfo.gi restored from backup successfully');
    } catch (error) {
      toast.error(`Failed to restore backup: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleResetToVanilla = async () => {
    if (
      !(await confirm(
        'Are you sure you want to reset gameinfo.gi to vanilla state? This will remove all mod configurations and restore the original game settings.'
      ))
    ) {
      return;
    }

    try {
      setIsOperating(true);
      await invoke('reset_to_vanilla');
      await refetch();
      toast.success('gameinfo.gi reset to vanilla state successfully');
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
      await invoke('validate_gameinfo_patch', { expectedVanilla: isVanilla });
      await refetch();
      toast.success('gameinfo.gi validation passed');
    } catch (error) {
      toast.error(`Validation failed: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  const handleOpenEditor = async () => {
    try {
      setIsOperating(true);
      await invoke('open_gameinfo_editor');
      toast.success('Opened gameinfo.gi with system editor');
    } catch (error) {
      toast.error(`Failed to open editor: ${error}`);
    } finally {
      setIsOperating(false);
    }
  };

  if (!status) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Display */}
      <div className="rounded-lg border bg-card p-4">
        <h4 className="mb-3 font-medium text-sm">Current Status</h4>
        <div className="flex flex-wrap items-center gap-4">
          {statusInfo?.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-muted-foreground text-sm">
                      {item.label}:
                    </span>
                    <Badge
                      variant={
                        item.color as 'default' | 'secondary' | 'destructive'
                      }
                    >
                      {item.value}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {item.label === 'Syntax' &&
                      'Whether the gameinfo.gi file has valid syntax'}
                    {item.label === 'Backup' &&
                      'Status of the backup file integrity'}
                    {item.label === 'Modifications' &&
                      'How the file was last modified'}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Warnings */}
        {status.is_modified_externally && (
          <div className="mt-3 rounded-md border-yellow-500 border-l-4 bg-yellow-50 p-3 dark:bg-yellow-950/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="font-medium text-sm text-yellow-800 dark:text-yellow-200">
                External modification detected
              </span>
            </div>
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
              The gameinfo.gi file has been modified by another tool. Consider
              creating a backup before making changes.
            </p>
          </div>
        )}

        {!status.backup_exists && (
          <div className="mt-3 rounded-md border-blue-500 border-l-4 bg-blue-50 p-3 dark:bg-blue-950/20">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800 text-sm dark:text-blue-200">
                No backup found
              </span>
            </div>
            <p className="mt-1 text-blue-700 text-xs dark:text-blue-300">
              Creating a backup is recommended before making modifications.
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isOperating || status.backup_exists}
          onClick={handleBackupGameInfo}
          size="default"
          variant="outline"
        >
          <Database className="h-4 w-4" />
          Create Backup
        </Button>

        <Button
          disabled={isOperating || !status.backup_exists}
          onClick={handleRestoreBackup}
          size="default"
          variant="outline"
        >
          <RefreshCcw className="h-4 w-4" />
          Restore Backup
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleResetToVanilla}
          size="default"
          variant="outline"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Vanilla
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleValidatePatch}
          size="default"
          variant="outline"
        >
          <FileCheck className="h-4 w-4" />
          Validate Configuration
        </Button>

        <Button
          disabled={isOperating}
          onClick={handleOpenEditor}
          size="default"
          variant="outline"
        >
          <Edit className="h-4 w-4" />
          Open in Editor
        </Button>
      </div>

      {/* File Information */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">File Hash:</span>{' '}
            <code className="font-mono">{status.current_hash}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Mod Paths:</span>{' '}
            <span
              className={
                status.has_mod_paths ? 'text-green-600' : 'text-gray-500'
              }
            >
              {status.has_mod_paths ? 'Present' : 'Not Present'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameInfoManagement;
