import type { Icon } from "@phosphor-icons/react";
import { forwardRef } from "react";

type CardActionProps = {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export const CardAction = forwardRef<HTMLButtonElement, CardActionProps>(
  ({ icon: ActionIcon, label, onClick, disabled, ...props }, ref) => (
    <button
      className='flex shrink-0 items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[#A3A3A3] text-[13px] leading-[normal] transition-colors hover:bg-[#FFFFFF0A] hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
      disabled={disabled}
      onClick={onClick}
      ref={ref}
      type='button'
      {...props}>
      <ActionIcon color='currentColor' size={16} />
      {label}
    </button>
  ),
);

CardAction.displayName = "CardAction";
