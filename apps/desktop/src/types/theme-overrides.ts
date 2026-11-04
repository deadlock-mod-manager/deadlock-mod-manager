import type { ComponentType, ReactNode } from "react";

export type ThemeOverrides = {
  brandName?: string;
  cardWrapper?: ComponentType<{ children: ReactNode }>;
  dashboardCardWrapper?: ComponentType<{ children: ReactNode }>;
  dashboardPage?: ComponentType<{ children: ReactNode }>;
  libraryBanner?: ComponentType;
  topbarLogo?: ComponentType;
  sidebarContentExtra?: ComponentType;
  sidebarFooterExtra?: ComponentType;
  settingsIngestExtra?: ComponentType;
};
