import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePersistedStore } from "@/lib/store";
import { selectIsDeadlockApiTheme } from "@/lib/store/selectors";
import { ElectricBorder } from "@/plugins/themes/pre-defined/deadlock-api/electric-border";

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
  const isDeadlockApiTheme = usePersistedStore(selectIsDeadlockApiTheme);

  if (isDeadlockApiTheme) {
    return (
      <ElectricBorder
        borderRadius={12}
        chaos={0.06}
        speed={0.8}
        className='h-full'>
        <Card className='h-full px-8 pb-2 bg-card ns-corners shadow-none flex flex-col'>
          <CardHeader className='py-4 px-0'>
            <CardTitle className='flex items-center gap-2 border-b border-border pb-4'>
              {icon}
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn(contentClassName, "p-0 rounded flex-1")}>
            {children}
          </CardContent>
        </Card>
      </ElectricBorder>
    );
  }

  const cardContent = (
    <Card className='h-full px-8 pb-2 bg-[#0d0b0a] ns-corners shadow-none [contain:layout_style_paint]'>
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

  return cardContent;
};
