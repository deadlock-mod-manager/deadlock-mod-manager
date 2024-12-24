import { ModDownloadDto, ModDto } from '@deadlock-mods/utils';

export interface Progress {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
}

export enum ModStatus {
  DOWNLOADED = 'downloaded',
  INSTALLED = 'installed',
  DOWNLOADING = 'downloading',
  INSTALLING = 'installing',
  ERROR = 'error'
}

export interface LocalMod extends ModDto {
  status: ModStatus;
  downloadedAt?: Date;
  path?: string;
  progress?: number;
  speed?: number;
  downloads?: ModDownloadDto;
}

export interface DownloadableMod extends Omit<LocalMod, 'status'> {
  onStart: () => void;
  onProgress: (progress: Progress) => void;
  onComplete: (path: string) => void;
  onError: (error: Error) => void;
}

export interface InstallableMod {
  id: string;
  name: string;
  path: string;
  installed_vpks: string[];
}
