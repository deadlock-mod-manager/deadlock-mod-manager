import { type Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { tint } from "@/components/plugins/plugin-identity";

type StateAreaProps = {
  icon: Icon;
  color: string;
  title: string;
  body: string;
  details?: ReactNode;
  children: ReactNode;
};

/** A centred notice that stands in for the plugin's own page. */
export const StateArea = ({
  icon: StateIcon,
  color,
  title,
  body,
  details,
  children,
}: StateAreaProps) => (
  <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6'>
    <span
      className='flex size-12 shrink-0 items-center justify-center rounded-full'
      style={{ backgroundColor: tint(color, "1A") }}>
      <StateIcon color={color} size={22} />
    </span>
    <div className='flex w-[420px] max-w-full flex-col items-center gap-1.5 text-center'>
      <h2 className='font-semibold text-[16px] text-foreground leading-[normal]'>
        {title}
      </h2>
      <p className='text-[13px] text-muted-foreground leading-[19px]'>{body}</p>
    </div>
    {details}
    <div className='flex items-start gap-2.5 pt-1.5'>{children}</div>
  </div>
);
