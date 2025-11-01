import { useEffect, useMemo, useState } from "react";

export type SortType =
  | "default"
  | "lastupdated"
  | "downloadcount"
  | "rating"
  | "releasedate";
export type FilterMode = "include" | "exclude";

export interface ModFilters {
  search: string;
  categories: string[];
  heroes: string[];
  showNSFW: boolean;
  audioOnly: boolean;
  filterMode: FilterMode;
  sortBy: SortType;
}

const defaultFilters: ModFilters = {
  search: "",
  categories: [],
  heroes: [],
  showNSFW: false,
  audioOnly: false,
  filterMode: "include",
  sortBy: "default",
};

enum ModCategory {
  SKINS = "Skins",
  GAMEPLAY_MODIFICATIONS = "Gameplay Modifications",
  HUD = "HUD",
  MODEL_REPLACEMENT = "Model Replacement",
  OTHER_MISC = "Other/Misc",
}

const MOD_CATEGORY_VALUES = Object.values(ModCategory);

interface MinimalMod {
  name: string;
  description: string | null;
  author: string;
  category: string;
  hero: string | null;
  isNSFW: boolean;
  isAudio: boolean;
  downloadCount: number;
  likes: number;
  updatedAt: Date | null;
  createdAt: Date | null;
}

export function useModFilters<T extends MinimalMod>(mods: T[]) {
  const [filters, setFilters] = useState<ModFilters>(defaultFilters);
  const [searchInput, setSearchInput] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.categories.length > 0) count++;
    if (filters.heroes.length > 0) count++;
    if (filters.showNSFW) count++;
    if (filters.audioOnly) count++;
    return count;
  }, [filters]);

  const filteredAndSortedMods = useMemo(() => {
    let result = [...mods];

    // Text search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (mod) =>
          mod.name.toLowerCase().includes(searchLower) ||
          mod.description?.toLowerCase().includes(searchLower) ||
          mod.author.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filters.categories.length > 0) {
      result = result.filter((mod) => {
        let matchesCategory = false;

        if (filters.categories.includes(mod.category)) {
          matchesCategory = true;
        }

        if (
          !matchesCategory &&
          filters.categories.includes(ModCategory.OTHER_MISC)
        ) {
          const predefinedCategories = MOD_CATEGORY_VALUES;
          matchesCategory = !predefinedCategories.includes(
            mod.category as ModCategory,
          );
        }

        return filters.filterMode === "include"
          ? matchesCategory
          : !matchesCategory;
      });
    }

    // Hero filter
    if (filters.heroes.length > 0) {
      result = result.filter((mod) => {
        let matchesHero = false;

        if (filters.heroes.includes("None")) {
          matchesHero =
            !mod.hero ||
            (mod.hero !== null && filters.heroes.includes(mod.hero));
        } else {
          matchesHero = mod.hero !== null && filters.heroes.includes(mod.hero);
        }

        return filters.filterMode === "include" ? matchesHero : !matchesHero;
      });
    }

    // NSFW filter
    if (filters.showNSFW) {
      result = result.filter((mod) => {
        const isNSFW = mod.isNSFW;
        return filters.filterMode === "include" ? isNSFW : !isNSFW;
      });
    }

    // Audio only filter
    if (filters.audioOnly) {
      result = result.filter((mod) => {
        const isAudio = mod.isAudio;
        return filters.filterMode === "include" ? isAudio : !isAudio;
      });
    }

    // Sorting
    switch (filters.sortBy) {
      case "lastupdated":
        result.sort((a, b) => {
          const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case "downloadcount":
        result.sort((a, b) => b.downloadCount - a.downloadCount);
        break;
      case "rating":
        result.sort((a, b) => b.likes - a.likes);
        break;
      case "releasedate":
        result.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      default:
        result.sort((a, b) => b.downloadCount - a.downloadCount);
        break;
    }

    return result;
  }, [mods, filters]);

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    setSearchInput("");
  };

  const updateFilters = (updates: Partial<ModFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const toggleCategory = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const toggleHero = (hero: string) => {
    setFilters((prev) => ({
      ...prev,
      heroes: prev.heroes.includes(hero)
        ? prev.heroes.filter((h) => h !== hero)
        : [...prev.heroes, hero],
    }));
  };

  return {
    filters,
    searchInput,
    setSearchInput,
    updateFilters,
    toggleCategory,
    toggleHero,
    clearAllFilters,
    activeFiltersCount,
    filteredAndSortedMods,
  };
}
