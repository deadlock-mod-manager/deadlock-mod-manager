import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { client } from "@/utils/orpc";

interface ModOption {
  remoteId: string;
  name: string;
  author: string;
  category: string;
  images: string[];
}

interface ModPickerProps {
  value: string | null;
  onSelect: (mod: { remoteId: string; name: string }) => void;
  excludeIds?: string[];
  placeholder?: string;
}

export function ModPicker({
  value,
  onSelect,
  excludeIds = [],
  placeholder = "Search mods...",
}: ModPickerProps) {
  const [open, setOpen] = useState(false);

  const modsQuery = useQuery({
    queryKey: ["mods-list-for-picker"],
    queryFn: async () => {
      const mods = await client.listModsV2();
      return mods.map(
        (mod): ModOption => ({
          remoteId: mod.remoteId,
          name: mod.name,
          author: mod.author,
          category: mod.category,
          images: mod.images,
        }),
      );
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const availableMods = (modsQuery.data ?? []).filter(
    (mod) => !excludeIds.includes(mod.remoteId),
  );

  const selectedMod = modsQuery.data?.find((mod) => mod.remoteId === value);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className='w-full justify-between'>
          {selectedMod ? (
            <span className='truncate'>{selectedMod.name}</span>
          ) : (
            <span className='text-muted-foreground'>{placeholder}</span>
          )}
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[400px] p-0' align='start'>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            {modsQuery.isPending ? (
              <div className='flex items-center justify-center py-6'>
                <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
                <span className='ml-2 text-muted-foreground text-sm'>
                  Loading mods...
                </span>
              </div>
            ) : (
              <>
                <CommandEmpty>No mods found.</CommandEmpty>
                <CommandGroup>
                  {availableMods.map((mod) => (
                    <CommandItem
                      key={mod.remoteId}
                      value={`${mod.name} ${mod.author}`}
                      onSelect={() => {
                        onSelect({
                          remoteId: mod.remoteId,
                          name: mod.name,
                        });
                        setOpen(false);
                      }}>
                      <div className='flex flex-1 items-center gap-3'>
                        {mod.images[0] && (
                          <img
                            src={mod.images[0]}
                            alt=''
                            className='h-8 w-8 rounded object-cover'
                          />
                        )}
                        <div className='min-w-0 flex-1'>
                          <div className='truncate text-sm'>{mod.name}</div>
                          <div className='truncate text-muted-foreground text-xs'>
                            by {mod.author} &middot; {mod.category}
                          </div>
                        </div>
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4 shrink-0",
                          value === mod.remoteId ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
