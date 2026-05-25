import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import {
  AUTOEXEC_CATEGORIES,
  type AutoexecCategoryDefinition,
  type AutoexecCategoryId,
  type FlatAutoexecCommand,
  FLAT_AUTOEXEC_COMMANDS,
} from "@/lib/autoexec/predefined-commands";

export type AutoexecLibraryCategoryFilter = AutoexecCategoryId | "all";

export interface AutoexecLibraryGroupedCategory {
  category: AutoexecCategoryDefinition;
  commands: FlatAutoexecCommand[];
}

const getSearchableText = (
  command: FlatAutoexecCommand,
  t: TFunction,
): string => {
  const description = t(`settings.autoexecCommands.${command.id}.description`);
  const categoryLabel = t(`settings.autoexecCategories.${command.categoryId}`);

  return [command.command, command.value, description, categoryLabel]
    .join(" ")
    .toLowerCase();
};

const matchesQuery = (
  command: FlatAutoexecCommand,
  normalizedQuery: string,
  t: TFunction,
): boolean => {
  if (normalizedQuery.length === 0) {
    return true;
  }

  return getSearchableText(command, t).includes(normalizedQuery);
};

export const useAutoexecLibraryFilter = (t: TFunction) => {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<AutoexecLibraryCategoryFilter>("all");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCommands = useMemo(() => {
    return FLAT_AUTOEXEC_COMMANDS.filter((command) => {
      if (
        selectedCategory !== "all" &&
        command.categoryId !== selectedCategory
      ) {
        return false;
      }

      return matchesQuery(command, normalizedQuery, t);
    });
  }, [normalizedQuery, selectedCategory, t]);

  const groupedCategories = useMemo((): AutoexecLibraryGroupedCategory[] => {
    if (selectedCategory !== "all") {
      return [];
    }

    return AUTOEXEC_CATEGORIES.map((category) => ({
      category,
      commands: filteredCommands.filter(
        (command) => command.categoryId === category.id,
      ),
    })).filter((group) => group.commands.length > 0);
  }, [filteredCommands, selectedCategory]);

  const hasResults =
    selectedCategory === "all"
      ? groupedCategories.length > 0
      : filteredCommands.length > 0;

  return {
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    filteredCommands,
    groupedCategories,
    hasResults,
  };
};
