import type { ReactNode } from "react";

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <span className='font-bold text-[#7C756E] text-[10px] uppercase leading-[normal] tracking-[1.1px]'>
    {children}
  </span>
);
