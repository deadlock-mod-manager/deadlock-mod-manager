import type { ReactNode } from "react";

export const Term = ({
  term,
  children,
}: {
  term: ReactNode;
  children: ReactNode;
}) => (
  <div className='grid grid-cols-[10rem_minmax(0,1fr)] items-baseline gap-4 py-1.5'>
    <dt className='text-foreground'>{term}</dt>
    <dd>{children}</dd>
  </div>
);
