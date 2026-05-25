import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useAutoexecLibraryFilter } from "@/hooks/use-autoexec-library-filter";
import type { FlatAutoexecCommand } from "@/lib/autoexec/predefined-commands";
import { AutoexecCategoryChips } from "./autoexec-category-chips";
import { AutoexecCommandRow } from "./autoexec-command-row";

type AutoexecCommandLibraryProps = {
  content: string;
  onAddCommand: (command: FlatAutoexecCommand) => void;
};

export const AutoexecCommandLibrary = ({
  content,
  onAddCommand,
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

  return (
    <div className='flex flex-col gap-4'>
      <Alert variant='warning'>
        <AlertTriangle className='h-4 w-4' />
        <AlertDescription>
          {t("settings.autoexecCommandWarning")}
        </AlertDescription>
      </Alert>

      <div className='flex flex-col gap-1'>
        <h4 className='font-semibold text-foreground text-sm'>
          {t("settings.autoexecLibraryHeading")}
        </h4>
        <p className='text-muted-foreground text-sm'>
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

      <div className='max-h-[420px] overflow-y-auto rounded-md border border-border/30 bg-background/20 p-3'>
        {!hasResults ? (
          <p className='py-8 text-center text-muted-foreground text-sm'>
            {t("settings.autoexecLibraryEmpty")}
          </p>
        ) : selectedCategory === "all" ? (
          <div className='flex flex-col gap-6'>
            {groupedCategories.map(({ category, commands }) => {
              const CategoryIcon = category.icon;

              return (
                <div className='flex flex-col gap-2' key={category.id}>
                  <div className='sticky top-0 z-10 flex items-center gap-2 border-border/30 border-b bg-background/95 py-2 backdrop-blur-sm'>
                    <CategoryIcon className='h-4 w-4 text-primary' />
                    <h5 className='font-semibold text-foreground text-sm'>
                      {t(`settings.autoexecCategories.${category.id}`)}
                    </h5>
                    <span className='text-muted-foreground text-xs'>
                      ({commands.length})
                    </span>
                  </div>
                  <div className='flex flex-col gap-2'>
                    {commands.map((command) => (
                      <AutoexecCommandRow
                        command={command}
                        content={content}
                        key={command.id}
                        onAddCommand={onAddCommand}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className='flex flex-col gap-2'>
            {filteredCommands.map((command) => (
              <AutoexecCommandRow
                command={command}
                content={content}
                key={command.id}
                onAddCommand={onAddCommand}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
