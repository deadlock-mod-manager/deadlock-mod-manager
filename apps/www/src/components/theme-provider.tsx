import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme='system'
      enableSystem
      storageKey='deadlock-www-theme'
      disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

export { useTheme } from "next-themes";
