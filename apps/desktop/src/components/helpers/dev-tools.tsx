import { invoke } from '@tauri-apps/api/core';
import { usePersistedStore } from '@/lib/store';
import { Button } from '../ui/button';

const DevTools = () => {
  const { clearMods } = usePersistedStore();
  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className="flex gap-2">
      <Button onClick={clearMods}>Clear Mods</Button>
      <Button onClick={() => invoke('stop_game')}>Stop Game</Button>
    </div>
  );
};

export default DevTools;
