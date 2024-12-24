import { invoke } from '@tauri-apps/api/core'

export const useLaunch = () => {
  /**
   * @param vanilla - Whether to launch the game in vanilla mode (no mods)
   */
  const launch = (vanilla = false) => {
    invoke('start_game', { vanilla })
  }

  return { launch }
}
