import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../button";

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        className='-ml-3 h-8 data-[state=open]:bg-accent'
        onClick={() => column.toggleSorting()}
        size='sm'
        variant='ghost'>
        <span>{title}</span>
        {column.getIsSorted() === "desc" ? (
          <ArrowDown />
        ) : column.getIsSorted() === "asc" ? (
          <ArrowUp />
        ) : (
          <ChevronsUpDown />
        )}
      </Button>
    </div>
  );
}
