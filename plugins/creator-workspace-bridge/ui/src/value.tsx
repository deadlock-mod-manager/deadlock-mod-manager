import type { ReactNode } from "react";

export function Value({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className='kv__value'>
      {icon}
      {children}
    </span>
  );
}
