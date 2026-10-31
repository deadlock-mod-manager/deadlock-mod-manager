import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  Copy,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  type DashboardTab,
  type DashboardWidget,
} from "@/lib/stats/dashboard/layout";
import { useTabTitle } from "./use-tab-title";
import { type GridActions } from "./grid-actions";

const WIDTH_PRESETS = [3, 4, 6, 8, 12] as const;

export interface WidgetMenuProps {
  widget: DashboardWidget;
  index: number;
  siblings: DashboardWidget[];
  tabs: DashboardTab[];
  currentTabId: string;
  actions: GridActions;
}

export const WidgetMenu = ({
  widget,
  index,
  siblings,
  tabs,
  currentTabId,
  actions,
}: WidgetMenuProps) => {
  const { t } = useTranslation();
  const tabTitle = useTabTitle();
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("stats.dashboard.widget.menu")}
          className='h-7 w-7'
          size='icon'
          variant='ghost'>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuItem onSelect={() => actions.onEdit(widget)}>
          <Pencil className='h-4 w-4' />
          {t("stats.dashboard.widget.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onDuplicate(widget.id)}>
          <Copy className='h-4 w-4' />
          {t("stats.dashboard.widget.duplicate")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Columns3 className='h-4 w-4' />
            {t("stats.dashboard.widget.width")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {WIDTH_PRESETS.map((width) => (
              <DropdownMenuItem
                key={width}
                onSelect={() =>
                  actions.onResize(widget.id, { w: width, h: widget.h })
                }>
                {t(`stats.dashboard.widths.${width}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {tabs.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className='h-4 w-4' />
              {t("stats.dashboard.widget.moveToTab")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {tabs
                .filter((tab) => tab.id !== currentTabId)
                .map((tab) => (
                  <DropdownMenuItem
                    key={tab.id}
                    onSelect={() => actions.onMoveToTab(widget.id, tab.id)}>
                    {tabTitle(tab)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem
          disabled={!previous}
          onSelect={() =>
            previous && actions.onReorder(widget.id, previous.id)
          }>
          <ArrowLeft className='h-4 w-4' />
          {t("stats.dashboard.widget.moveEarlier")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!next}
          onSelect={() => next && actions.onReorder(widget.id, next.id)}>
          <ArrowRight className='h-4 w-4' />
          {t("stats.dashboard.widget.moveLater")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='text-destructive focus:text-destructive'
          onSelect={() => actions.onRemove(widget.id)}>
          <Trash2 className='h-4 w-4' />
          {t("stats.dashboard.widget.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
