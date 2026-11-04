import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "deadlock-theme",
  ...props
}: Readonly<ThemeProviderProps>) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (globalThis.window !== undefined && globalThis.localStorage) {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = globalThis.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = globalThis.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const handleSetTheme = useCallback(
    (theme: Theme) => {
      if (globalThis.window !== undefined && globalThis.localStorage) {
        localStorage.setItem(storageKey, theme);
      }
      setTheme(theme);
    },
    [storageKey],
  );

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme: handleSetTheme,
    }),
    [theme, handleSetTheme],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
