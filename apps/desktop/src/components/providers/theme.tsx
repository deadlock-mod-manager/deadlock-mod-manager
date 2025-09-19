import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  flashbangEnabled: boolean;
  setFlashbangEnabled: (enabled: boolean) => void;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
  flashbangEnabled: false,
  setFlashbangEnabled: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "deadlock-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [flashbangEnabled, setFlashbangEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("deadlock-flashbang") === "true";
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (flashbangEnabled) {
      const now = new Date();
      const currentHour = now.getHours();

      if (currentHour >= 20 || currentHour < 8) {
        root.classList.add("light");
        return;
      }
    }

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme, flashbangEnabled]);

  useEffect(() => {
    if (!flashbangEnabled) {
      return;
    }

    const checkFlashbang = () => {
      const root = window.document.documentElement;
      const now = new Date();
      const currentHour = now.getHours();

      // Zwischen 20:00 und 8:00 Uhr Light Mode erzwingen
      if (currentHour >= 20 || currentHour < 8) {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        // Außerhalb der Flashbang-Zeit normale Theme-Logik anwenden
        root.classList.remove("light", "dark");

        if (theme === "system") {
          const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
            .matches
            ? "dark"
            : "light";
          root.classList.add(systemTheme);
        } else {
          root.classList.add(theme);
        }
      }
    };

    checkFlashbang();

    const interval = setInterval(checkFlashbang, 60_000);

    return () => clearInterval(interval);
  }, [flashbangEnabled, theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(storageKey, theme);
      }
      setTheme(theme);
    },
    flashbangEnabled,
    setFlashbangEnabled: (enabled: boolean) => {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem("deadlock-flashbang", enabled.toString());
      }
      setFlashbangEnabled(enabled);
    },
  };

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
