import type { ModDownloadDto, ModDto } from '@deadlock-mods/utils';

export type Progress = {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
};

export enum ModStatus {
  DOWNLOADED = 'downloaded',
  INSTALLED = 'installed',
  DOWNLOADING = 'downloading',
  INSTALLING = 'installing',
  ERROR = 'error',
}

export interface LocalMod extends ModDto {
  status: ModStatus;
  downloadedAt?: Date;
  path?: string;
  downloads?: ModDownloadDto;
  installedVpks?: string[];
}

export interface DownloadableMod extends Omit<LocalMod, 'status'> {
  onStart: () => void;
  onProgress: (progress: Progress) => void;
  onComplete: (path: string) => void;
  onError: (error: Error) => void;
}

export type InstallableMod = {
  id: string;
  name: string;
  path: string;
  installed_vpks: string[];
};
