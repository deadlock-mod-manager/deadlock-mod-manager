import type { ReactNode } from "react";

// Gives 16px source marks the visual weight of the two-line row beside them.
export const SourceIconTile = ({ children }: { children: ReactNode }) => (
  <span className='flex size-9 items-center justify-center rounded-md border border-border/60 bg-muted/40'>
    {children}
  </span>
);
