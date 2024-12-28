import { CustomSettingDto, ModDownloadDto, ModDto } from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:9000',
  headers: {
    'Content-Type': 'application/json'
  }
});

export const getMods = async () => {
  const response = await api.get<ModDto[]>('/mods');
  return response.data;
}; // TODO: pagination

export const getModDownload = async (remoteId: string) => {
  const response = await api.get<ModDownloadDto>(`/mods/${remoteId}/download`);
  return response.data;
};

export const getCustomSettings = async () => {
  const response = await api.get<CustomSettingDto[]>('/custom-settings');
  return response.data;
};

export const isGameRunning = async () => {
  return !!(await invoke('is_game_running'));
};
