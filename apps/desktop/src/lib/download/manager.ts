import { DownloadableMod } from '@/types/mods'
import { appLocalDataDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs'
import { download } from '@tauri-apps/plugin-upload'
import { toast } from 'sonner'
import { getModDownload } from '../api'
const createIfNotExists = async (path: string) => {
  try {
    const dirExists = await exists(path, { baseDir: BaseDirectory.AppLocalData })
    if (!dirExists) {
      console.info(`Creating ${path} directory`)
      await mkdir(path, { baseDir: BaseDirectory.AppLocalData })
    }
  } catch (error) {
    console.error(`Failed to create ${path} directory`)
    console.error(error)
    toast.error(`Failed to create ${path} directory`)
  }
}

class DownloadManager {
  private queue: DownloadableMod[] = []

  constructor() {
    this.queue = []
  }

  addToQueue(mod: DownloadableMod) {
    this.queue.push(mod)
  }

  removeFromQueue(mod: DownloadableMod) {
    this.queue = this.queue.filter((m) => m.id !== mod.id)
  }

  async init() {
    await createIfNotExists('mods')
  }

  async process() {
    if (this.queue.length === 0) return
    const mod = this.queue.shift()
    if (!mod) return

    try {
      mod.onStart()

      const modsDir = await appLocalDataDir()
      const modDir = await join(modsDir, 'mods', mod.remoteId)

      await createIfNotExists(modDir)

      if (!mod.downloads) {
        const downloads = await getModDownload(mod.remoteId)
        mod.downloads = downloads
      }

      const file = mod.downloads[0] // TODO: handle multiple files

      await download(file.url, await join(modDir, `${file.name}`), (progress) => {
        console.log('Downloading', progress)
        mod.onProgress(progress)
        if (progress.progressTotal === progress.total) {
          mod.onComplete(modDir)
        }
      })
    } catch (error) {
      console.error('Failed to download mod', error)
      toast.error('Failed to download mod')
      mod.onError(error as Error)
    }
  }
}

export const downloadManager = new DownloadManager()
