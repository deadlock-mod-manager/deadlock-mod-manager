import type {
  CustomSettingDto,
  ModDownloadDto,
  ModDto,
} from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:9000',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getMods = async () => {
  const response = await api.get<ModDto[]>('/mods');
  return response.data;
}; // TODO: pagination

export const getMod = async (remoteId: string) => {
  const response = await api.get<ModDto>(`/mods/${remoteId}`);
  return response.data;
};

export const getModDownload = async (remoteId: string) => {
  const response = await api.get<ModDownloadDto[]>(
    `/api/v2/mods/${remoteId}/download`
  );
  return response.data;
};

export const getModDownloads = async (remoteId: string) => {
  const response = await api.get<{
    downloads: ModDownloadDto[];
    count: number;
    primary: ModDownloadDto;
  }>(`/api/v2/mods/${remoteId}/downloads`);
  return response.data;
};

export const getCustomSettings = async () => {
  const response = await api.get<CustomSettingDto[]>('/custom-settings');
  return response.data;
};

export const isGameRunning = async () => {
  return !!(await invoke('is_game_running'));
};

// Gameinfo.gi management functions
export const backupGameInfo = async () => {
  return await invoke('backup_gameinfo');
};

export const restoreGameInfoBackup = async () => {
  return await invoke('restore_gameinfo_backup');
};

export const resetToVanilla = async () => {
  return await invoke('reset_to_vanilla');
};

export const validateGameInfoPatch = async (expectedVanilla: boolean) => {
  return await invoke('validate_gameinfo_patch', { expectedVanilla });
};

export const getGameInfoStatus = async () => {
  return await invoke('get_gameinfo_status');
};

export const openGameInfoEditor = async () => {
  return await invoke('open_gameinfo_editor');
};
