import { DataTable } from '@/components/ui/data-table'
import useInstall from '@/hooks/use-install'
import { usePersistedStore } from '@/lib/store'
import { LocalMod, ModStatus } from '@/types/mods'
import { toast } from 'sonner'
import { createColumns } from './columns'

export const ModsTable = ({ mods }: { mods: LocalMod[] }) => {
  const { setModStatus } = usePersistedStore()
  const { install } = useInstall()

  const columns = createColumns(install, {
    onStart: (mod) => {
      setModStatus(mod.remoteId, ModStatus.INSTALLING)
    },
    onComplete: (mod, result) => {
      console.log('complete', mod, result)
      setModStatus(mod.remoteId, ModStatus.INSTALLED)
    },
    onError: (mod, error) => {
      console.log('> Mod: ', mod.id)
      console.error(error)

      switch (error.kind) {
        case 'modAlreadyInstalled':
          setModStatus(mod.remoteId, ModStatus.INSTALLED)
          toast.error(error.message)
          break
        default:
          setModStatus(mod.remoteId, ModStatus.ERROR)
          toast.error(error.message)
      }
    }
  })

  return <DataTable columns={columns} data={mods} />
}
