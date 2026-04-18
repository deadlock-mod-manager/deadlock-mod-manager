export type PasswordFilter = "all" | "open" | "password";

export interface ServerFiltersValue {
  search: string;
  hasPlayers: boolean;
  password: PasswordFilter;
  gameMode: string;
  region: string;
}

export interface ServerFiltersProps {
  value: ServerFiltersValue;
  onChange: (next: ServerFiltersValue) => void;
  availableGameModes: string[];
  availableRegions: string[];
  total: number;
  isFetching?: boolean;
  onRefresh?: () => void;
}

export const ANY = "__any__";

export const EMPTY_FILTERS: ServerFiltersValue = {
  search: "",
  hasPlayers: false,
  password: "all",
  gameMode: "",
  region: "",
};
