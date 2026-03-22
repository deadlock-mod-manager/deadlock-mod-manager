import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useThemeOverride } from "@/components/providers/theme-overrides";

type DashboardCardProps = {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  contentClassName?: string;
};

export const DashboardCard = ({
  title,
  icon,
  children,
  contentClassName,
}: DashboardCardProps) => {
  const Wrapper = useThemeOverride("dashboardCardWrapper");

  const card = (
    <Card className='h-full px-8 pb-2 bg-card ns-corners shadow-none [contain:layout_style_paint]'>
      <CardHeader className='py-4 px-0'>
        <CardTitle className='flex items-center gap-2 border-b border-border pb-4'>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={cn(contentClassName, "p-0 rounded")}>
        {children}
      </CardContent>
    </Card>
  );

  if (Wrapper) {
    return <Wrapper>{card}</Wrapper>;
  }

  return card;
};
