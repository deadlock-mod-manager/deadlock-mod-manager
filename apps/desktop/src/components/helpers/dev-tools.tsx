import { usePersistedStore } from '@/lib/store'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../ui/button'

const DevTools = () => {
  const { clearMods } = usePersistedStore()

  return (
    <div className="flex gap-2">
      <Button onClick={clearMods}>Clear Mods</Button>
      <Button onClick={() => invoke('find_game_path')}>Find Game Folder</Button>
      <Button
        onClick={() =>
          invoke('install_mod', {
            deadlockMod: {
              id: '123',
              name: 'Test Mod',
              path: 'lol',
              enabled: true
            }
          })
        }
      >
        Test Install
      </Button>
    </div>
  )
}

export default DevTools
