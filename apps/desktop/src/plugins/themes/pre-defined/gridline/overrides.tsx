import type { ReactNode } from "react";
import type { ThemeOverrides } from "@/types/theme-overrides";

const CardWrapper = ({ children }: { children: ReactNode }) => (
  <div className='gridline-gradient-frame h-full' data-reveal='hover'>
    {children}
  </div>
);

const DashboardCardWrapper = ({ children }: { children: ReactNode }) => (
  <div className='gridline-gradient-frame h-full'>{children}</div>
);

export const overrides: ThemeOverrides = {
  cardWrapper: CardWrapper,
  dashboardCardWrapper: DashboardCardWrapper,
};
