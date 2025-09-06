import { Trash } from '@phosphor-icons/react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  InstallWithCollectionFunction,
  InstallWithCollectionOptions,
} from '@/hooks/use-install-with-collection';
import { type LocalMod, ModStatus } from '@/types/mods';
import Status from '../status';
import { Button } from '../ui/button';
import { DataTableColumnHeader } from '../ui/data-table/column-header';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export const createColumns = (
  install: InstallWithCollectionFunction,
  options: InstallWithCollectionOptions,
  remove: (mod: LocalMod) => void,
  uninstall: (mod: LocalMod) => void
) => {
  return [
    {
      accessorKey: 'images',
      header: () => null,
      cell: ({ row }) => {
        const src = row.original.images[0];
        return (
          <img
            alt="Thumbnail"
            className="h-16 w-16 rounded-md object-cover"
            height="64"
            src={src}
            width="64"
          />
        );
      },
    },

    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-2">
          <div className="overflow-clip text-ellipsis text-nowrap">
            {row.original.name}
          </div>
          <div className="text-muted-foreground text-sm">
            {' '}
            By {row.original.author}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      accessorKey: 'downloadedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Downloaded At" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.downloadedAt
            ? new Date(row.original.downloadedAt).toLocaleDateString()
            : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.status === ModStatus.INSTALLED}
              id="install-mod"
              onCheckedChange={(value) => {
                if (value) {
                  install(row.original, options);
                } else {
                  uninstall(row.original);
                }
              }}
            />
            <Label className="text-xs" htmlFor="install-mod">
              {row.original.status === ModStatus.INSTALLED
                ? 'Disable'
                : 'Enable'}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => remove(row.original)}
                  size={'icon'}
                  variant="outline"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove mod</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ),
    },
  ] satisfies ColumnDef<LocalMod>[];
};
