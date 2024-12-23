import { LocalMod, ModStatus } from '@/types/mods'
import { ColumnDef } from '@tanstack/react-table'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import Status from '../status'
import { DataTableColumnHeader } from '../ui/data-table/column-header'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

export const columns: ColumnDef<LocalMod>[] = [
  {
    accessorKey: 'images',
    header: () => null,
    cell: ({ row }) => {
      const src = row.original.images[0]
      return <img src={src} alt="Thumbnail" className="rounded-md object-cover h-16 w-16" />
    }
  },

  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <div className="flex flex-col gap-2">
        <div className="text-ellipsis overflow-clip text-nowrap">{row.original.name}</div>
        <div className="text-muted-foreground text-sm"> By {row.original.author}</div>
      </div>
    )
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <Status status={row.original.status} />
  },
  {
    accessorKey: 'downloadedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Downloaded At" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.downloadedAt ? new Date(row.original.downloadedAt).toLocaleDateString() : '-'}
      </span>
    )
  },
  {
    accessorKey: 'actions',
    header: () => null,
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        <Switch
          id="install-mod"
          checked={row.original.status === ModStatus.INSTALLED}
          onCheckedChange={(checked) => {
            if (!row.original.path) {
              toast.error('Mod is not downloaded!')
              return
            }
            invoke('install_mod', {
              deadlockMod: {
                id: row.original.id,
                name: row.original.name,
                path: row.original.path,
                enabled: checked
              }
            })
          }}
        />
        <Label htmlFor="install-mod" className="text-xs">
          {row.original.status === ModStatus.INSTALLED ? 'Uninstall' : 'Install'}
        </Label>
      </div>
    )
  }
]
