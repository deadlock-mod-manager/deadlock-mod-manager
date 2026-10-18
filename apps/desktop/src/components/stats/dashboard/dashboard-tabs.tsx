import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import {
  ArrowLeft,
  ArrowRight,
  ChartLine,
  Clock,
  Coins,
  Flame,
  Globe,
  Package,
  Pencil,
  Plus,
  Radio,
  Star,
  Sword,
  Target,
  Trash2,
  TriangleAlert,
  Trophy,
  Users,
} from "@deadlock-mods/ui/icons";
import { type ComponentType, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type DashboardTab,
  TAB_ICONS,
  type TabIcon,
} from "@/lib/stats/dashboard/layout";
import { TAB_TEMPLATE_IDS } from "@/lib/stats/dashboard/templates";
import { cn } from "@/lib/utils";
import { useTabTitle } from "./use-tab-title";

const ICONS = {
  chart: ChartLine,
  sword: Sword,
  package: Package,
  users: Users,
  radio: Radio,
  trophy: Trophy,
  target: Target,
  flame: Flame,
  clock: Clock,
  star: Star,
  globe: Globe,
  coins: Coins,
} satisfies Record<TabIcon, ComponentType<{ className?: string }>>;

const TAB_TRIGGER_CLASS = "h-8 gap-1.5 px-3";

interface TabSettingsProps {
  tab: DashboardTab;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onRename: (title: string) => void;
  onIcon: (icon: TabIcon) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

const TabSettings = ({
  tab,
  isFirst,
  isLast,
  canDelete,
  onRename,
  onIcon,
  onMove,
  onDelete,
}: TabSettingsProps) => {
  const { t } = useTranslation();
  const tabTitle = useTabTitle();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(tabTitle(tab));

  // However the dialog closes - Done, Enter, Escape or a click outside - the
  // typed name is kept. An untouched name is left alone, so a built-in tab
  // keeps following the app language.
  const changeOpen = (next: boolean) => {
    if (next) {
      setTitle(tabTitle(tab));
    } else if (title.trim() !== tabTitle(tab)) {
      onRename(title);
    }
    setOpen(next);
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label={t("stats.dashboard.tabs.settings")}
          className='h-9 w-9 shrink-0'
          size='icon'
          title={t("stats.dashboard.tabs.settings")}
          variant='outline'>
          <Pencil className='h-3.5 w-3.5' />
        </Button>
      </DialogTrigger>
      <DialogContent className='flex max-w-sm flex-col gap-4'>
        <DialogHeader>
          <DialogTitle>{t("stats.dashboard.tabs.settings")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            changeOpen(false);
          }}>
          <Input
            aria-label={t("stats.dashboard.tabs.name")}
            maxLength={40}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </form>
        <div className='grid grid-cols-6 gap-1'>
          {TAB_ICONS.map((icon) => {
            const Icon = ICONS[icon];
            return (
              <button
                aria-label={icon}
                aria-pressed={tab.icon === icon}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md border",
                  tab.icon === icon
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent",
                )}
                key={icon}
                onClick={() => onIcon(icon)}
                type='button'>
                <Icon className='h-4 w-4' />
              </button>
            );
          })}
        </div>
        <div className='flex items-center gap-1'>
          <Button
            aria-label={t("stats.dashboard.tabs.moveLeft")}
            className='h-8 w-8'
            disabled={isFirst}
            onClick={() => onMove(-1)}
            size='icon'
            variant='outline'>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <Button
            aria-label={t("stats.dashboard.tabs.moveRight")}
            className='h-8 w-8'
            disabled={isLast}
            onClick={() => onMove(1)}
            size='icon'
            variant='outline'>
            <ArrowRight className='h-4 w-4' />
          </Button>
          <Button
            className='ml-auto h-8 gap-1.5 text-destructive hover:text-destructive'
            disabled={!canDelete}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            size='sm'
            variant='ghost'>
            <Trash2 className='h-3.5 w-3.5' />
            {t("stats.dashboard.tabs.delete")}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => changeOpen(false)}>
            {t("stats.dashboard.tabs.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface DashboardTabsProps {
  tabs: DashboardTab[];
  activeTabId: string;
  editing: boolean;
  /** Tab ids holding at least one broken widget. */
  brokenTabIds: ReadonlySet<string>;
  onSelect: (tabId: string) => void;
  onAddTab: (templateId: string | null) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onTabIcon: (tabId: string, icon: TabIcon) => void;
  onMoveTab: (tabId: string, offset: -1 | 1) => void;
  onDeleteTab: (tab: DashboardTab) => void;
}

export const DashboardTabs = ({
  tabs,
  activeTabId,
  editing,
  brokenTabIds,
  onSelect,
  onAddTab,
  onRenameTab,
  onTabIcon,
  onMoveTab,
  onDeleteTab,
}: DashboardTabsProps) => {
  const { t } = useTranslation();
  const tabTitle = useTabTitle();
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const activeTab = tabs[activeIndex];

  return (
    // Many tabs outgrow a narrow window before anything else in the header
    // does; scrolling them keeps every tab reachable instead of clipped.
    <div className='flex max-w-full items-center gap-2 overflow-x-auto'>
      <Tabs onValueChange={onSelect} value={activeTabId}>
        <TabsList className='h-10 w-max gap-1 bg-muted/60 p-1'>
          {tabs.map((tab) => {
            const Icon = ICONS[tab.icon];
            return (
              <TabsTrigger
                className={TAB_TRIGGER_CLASS}
                data-broken={brokenTabIds.has(tab.id)}
                data-tab-id={tab.id}
                key={tab.id}
                value={tab.id}>
                <Icon className='h-4 w-4' />
                {tabTitle(tab)}
                {brokenTabIds.has(tab.id) && (
                  <TriangleAlert
                    aria-label={t("stats.dashboard.tabs.broken")}
                    className='h-3.5 w-3.5 text-amber-500'
                  />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {/* Outside the tab list on purpose: its roving focus would otherwise
          reach into the portalled popover, take the name field's keys and
          close the popover by moving focus onto a tab. */}
      {editing && activeTab && (
        <TabSettings
          canDelete={tabs.length > 1}
          isFirst={activeIndex === 0}
          isLast={activeIndex === tabs.length - 1}
          key={activeTab.id}
          onDelete={() => onDeleteTab(activeTab)}
          onIcon={(icon) => onTabIcon(activeTab.id, icon)}
          onMove={(offset) => onMoveTab(activeTab.id, offset)}
          onRename={(title) => onRenameTab(activeTab.id, title)}
          tab={activeTab}
        />
      )}
      {editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className='h-9 shrink-0 gap-1.5'
              data-testid='stats-add-tab'
              size='sm'
              variant='outline'>
              <Plus className='h-4 w-4' />
              {t("stats.dashboard.tabs.add")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='w-60'>
            <DropdownMenuItem onSelect={() => onAddTab(null)}>
              <Plus className='h-4 w-4' />
              {t("stats.dashboard.tabs.empty")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className='text-muted-foreground text-xs'>
              {t("stats.dashboard.tabs.fromTemplate")}
            </DropdownMenuLabel>
            {TAB_TEMPLATE_IDS.map((templateId) => (
              <DropdownMenuItem
                key={templateId}
                onSelect={() => onAddTab(templateId)}>
                {t(`stats.dashboard.templates.${templateId}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
