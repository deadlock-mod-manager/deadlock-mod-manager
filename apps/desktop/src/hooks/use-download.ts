import { downloadManager } from '@/lib/download/manager'
import { usePersistedStore } from '@/lib/store'
import { ModStatus, Progress } from '@/types/mods'
import { ModDto } from '@deadlock-mods/utils'
import { useState } from 'react'
import { toast } from 'sonner'

export const useDownload = (mod: ModDto | undefined) => {
  const { addMod, mods, setModStatus, removeMod, setModPath } = usePersistedStore()
  const [progress, setProgress] = useState<Progress | null>(null)
  const localMod = mods.find((m) => m.remoteId === mod?.remoteId)

  const downloadMod = async () => {
    if (!mod) {
      toast.error('Failed to fetch mod download data. Try again later.')
      console.error('Failed to fetch mod download data. Try again later.')
      return
    }

    addMod(mod)

    return downloadManager.addToQueue({
      ...mod,
      onStart: () => setModStatus(mod.remoteId, ModStatus.DOWNLOADING),
      onProgress: (progress) => setProgress(progress),
      onComplete: (path) => {
        setModStatus(mod.remoteId, ModStatus.DOWNLOADED)
        setModPath(mod.remoteId, path)
      },
      onError: () => {
        setModStatus(mod.remoteId, ModStatus.ERROR)
        removeMod(mod.remoteId)
      }
    })
  }

  return {
    download: downloadMod,
    progress,
    localMod
  }
}
