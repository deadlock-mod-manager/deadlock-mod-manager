import { Alert } from "@deadlock-mods/ui/components/alert";
import { WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export const Notice = ({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) => (
  <Alert className='py-2' variant='warning'>
    <WarningIcon className='size-4 shrink-0' />
    <p className='min-w-0 flex-1'>{children}</p>
    {action}
  </Alert>
);
