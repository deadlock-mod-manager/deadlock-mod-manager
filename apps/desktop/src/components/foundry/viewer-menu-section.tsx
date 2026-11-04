import { type ReactNode } from "react";

export const MenuSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className='py-1'>
    <p className='px-2 pt-1 pb-1.5 font-medium text-[11px] text-muted-foreground'>
      {title}
    </p>
    {children}
  </div>
);
