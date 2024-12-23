import { DataTable } from '@/components/ui/data-table'
import { LocalMod } from '@/types/mods'
import { columns } from './columns'

export const ModsTable = ({ mods }: { mods: LocalMod[] }) => {
  return <DataTable columns={columns} data={mods} />
}
