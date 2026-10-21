import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useRemovedConvars } from "@/hooks/performance/use-perf-queries";
import { useAutoexecLibraryFilter } from "@/hooks/use-autoexec-library-filter";
import {
  FLAT_AUTOEXEC_COMMANDS,
  type FlatAutoexecCommand,
} from "@/lib/autoexec/predefined-commands";
import { AutoexecCategoryChips } from "./autoexec-category-chips";
import { AutoexecCommandRow } from "./autoexec-command-row";

const COMMAND_NAMES = FLAT_AUTOEXEC_COMMANDS.map((command) => command.command);

type AutoexecCommandLibraryProps = {
  content: string;
  onAddCommand: (command: FlatAutoexecCommand) => void;
  onRevealCommand: (command: FlatAutoexecCommand) => void;
};

export const AutoexecCommandLibrary = ({
  content,
  onAddCommand,
  onRevealCommand,
}: AutoexecCommandLibraryProps) => {
  const { t } = useTranslation();
  const {
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    filteredCommands,
    groupedCategories,
    hasResults,
  } = useAutoexecLibraryFilter(t);
  const removedConvars = useRemovedConvars(COMMAND_NAMES);

  const renderRow = (command: FlatAutoexecCommand) => (
    <AutoexecCommandRow
      command={command}
      content={content}
      isOutdated={removedConvars?.has(command.command) ?? false}
      key={command.id}
      onAddCommand={onAddCommand}
      onRevealCommand={onRevealCommand}
    />
  );

  return (
    <div className='flex h-[520px] min-h-0 flex-col overflow-hidden rounded-md border border-border/40 bg-background/30 xl:h-auto'>
      <div className='flex flex-col gap-2 border-border/30 border-b px-3 pt-2 pb-2.5'>
        <div className='flex flex-col'>
          <h4 className='font-semibold text-foreground text-sm'>
            {t("settings.autoexecLibraryHeading")}
          </h4>
          <p className='text-muted-foreground text-xs'>
            {t("settings.autoexecLibraryDescription")}
          </p>
        </div>
        <SearchInput
          id='autoexec-command-search'
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.autoexecLibrarySearchPlaceholder")}
          value={query}
        />
        <AutoexecCategoryChips
          onCategoryChange={setSelectedCategory}
          selectedCategory={selectedCategory}
        />
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {!hasResults ? (
          <p className='py-8 text-center text-muted-foreground text-sm'>
            {t("settings.autoexecLibraryEmpty")}
          </p>
        ) : selectedCategory === "all" ? (
          groupedCategories.map(({ category, commands }) => {
            const CategoryIcon = category.icon;

            return (
              <div key={category.id}>
                <div className='sticky top-0 z-10 flex items-center gap-2 border-border/30 border-b bg-card px-3 py-1.5'>
                  <CategoryIcon className='h-3.5 w-3.5 text-primary' />
                  <h5 className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
                    {t(`settings.autoexecCategories.${category.id}`)}
                  </h5>
                  <span className='text-muted-foreground/70 text-xs'>
                    {commands.length}
                  </span>
                </div>
                {commands.map(renderRow)}
              </div>
            );
          })
        ) : (
          filteredCommands.map(renderRow)
        )}
      </div>

      <div className='flex items-start gap-2 border-border/30 border-t px-3 py-2 text-muted-foreground text-xs'>
        <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400' />
        <p>{t("settings.autoexecCommandWarning")}</p>
      </div>
    </div>
  );
};
