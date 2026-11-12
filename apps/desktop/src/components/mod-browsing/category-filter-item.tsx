import { CommandItem } from "@deadlock-mods/ui/components/command";
import { Check } from "@deadlock-mods/ui/icons";
import { CaretRightIcon, FolderIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type CategoryFilterItemProps = {
  value: string;
  label: string;
  description?: string;
  onSelect: () => void;
} & (
  | { kind: "browse"; selectedCount: number }
  | { kind: "select"; checked: boolean }
);

export const CategoryFilterItem = (props: CategoryFilterItemProps) => {
  const { t } = useTranslation();
  const checked = props.kind === "select" && props.checked;
  return (
    <CommandItem
      aria-checked={props.kind === "select" ? checked : undefined}
      aria-label={
        props.kind === "browse"
          ? t("filters.browseCategory", { name: props.label })
          : t("filters.categorySelectionState", {
              name: props.label,
              state: t(checked ? "filters.selected" : "filters.notSelected"),
            })
      }
      className={cn(
        "min-h-10 gap-3 px-3 py-2",
        checked && "bg-primary/10 text-primary",
      )}
      data-checked={props.kind === "select" ? checked : undefined}
      onSelect={props.onSelect}
      value={props.value}>
      {props.kind === "browse" ? (
        <FolderIcon className='text-muted-foreground' />
      ) : (
        <span
          aria-hidden='true'
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-muted-foreground/50",
            checked && "border-primary bg-primary text-primary-foreground",
          )}>
          {checked ? <Check /> : null}
        </span>
      )}
      <span className='min-w-0 flex-1'>
        <span className='block truncate'>{props.label}</span>
        {props.description ? (
          <span className='block truncate text-muted-foreground text-xs'>
            {props.description}
          </span>
        ) : null}
      </span>
      {props.kind === "browse" ? (
        <>
          {props.selectedCount > 0 ? (
            <span className='text-primary text-xs'>
              {t("filters.categoriesSelected", { count: props.selectedCount })}
            </span>
          ) : null}
          <CaretRightIcon className='text-muted-foreground' />
        </>
      ) : null}
    </CommandItem>
  );
};
