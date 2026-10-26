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
import { CheckIcon, CaretUpDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";

interface Props {
  actions: PreviewAnimationChoice[];
  selected: PreviewAnimationChoice | null;
  onSelect: (id: string) => void;
}

export const ViewerAnimationPicker = ({
  actions,
  selected,
  onSelect,
}: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const select = (id: string) => {
    onSelect(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          role='combobox'
          aria-expanded={open}
          aria-label={t("modelPreview.animation")}
          className='h-8 min-w-40 max-w-64 justify-between gap-3 text-xs'>
          <span className='truncate'>
            {selected ? t(selected.label) : t("modelPreview.restPose")}
          </span>
          <CaretUpDownIcon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' side='top' className='w-80 p-0'>
        <Command>
          <CommandInput placeholder={t("modelPreview.searchAnimations")} />
          <CommandList>
            <CommandEmpty>
              {t("modelPreview.noMatchingAnimations")}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("modelPreview.restPose")}
                onSelect={() => select("rest")}>
                <CheckIcon className={selected ? "invisible" : ""} />
                {t("modelPreview.restPose")}
              </CommandItem>
            </CommandGroup>
            {(
              ["movement", "ability"] satisfies PreviewAnimationChoice["kind"][]
            ).map((kind) => (
              <CommandGroup
                key={kind}
                heading={t(
                  kind === "movement"
                    ? "modelPreview.movement"
                    : "modelPreview.abilities",
                )}>
                {actions
                  .filter((action) => action.kind === kind)
                  .map((action) => (
                    <CommandItem
                      key={action.id}
                      value={`${t(action.label)} ${action.id}`}
                      onSelect={() => select(action.id)}>
                      <CheckIcon
                        className={
                          selected?.id === action.id ? "" : "invisible"
                        }
                      />
                      <span className='truncate'>{t(action.label)}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
