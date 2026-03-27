import type { ComponentType, ReactNode } from "react";

export type ThemeOverrides = {
  cardWrapper?: ComponentType<{ children: ReactNode }>;
  dashboardCardWrapper?: ComponentType<{ children: ReactNode }>;
  dashboardPage?: ComponentType<{ children: ReactNode }>;
  topbarLogo?: ComponentType;
  sidebarContentExtra?: ComponentType;
  sidebarFooterExtra?: ComponentType;
  settingsIngestExtra?: ComponentType;
};
