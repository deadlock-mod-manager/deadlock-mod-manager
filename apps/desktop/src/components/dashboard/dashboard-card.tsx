import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  return (
    <Card className='h-full px-8 pb-2 bg-[#0d0b0a]'>
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
};
