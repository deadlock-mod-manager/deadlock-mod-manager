import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowRightIcon, type Icon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Ruled dashboard section header with an external "see more" link. */
export const SectionHeader = ({
  icon: HeaderIcon,
  title,
  linkLabel,
  linkUrl,
}: {
  icon: Icon;
  title: string;
  linkLabel: string;
  linkUrl: string;
}) => (
  <header className='mb-4 flex items-center justify-between gap-3 border-primary/20 border-b pb-2'>
    <h3
      className='flex items-center gap-2 font-bold text-foreground text-xl tracking-tight lg:text-2xl'
      style={{ fontFamily: '"Forevs Demo", serif' }}>
      <HeaderIcon className='size-5 text-primary' weight='duotone' />
      {title}
    </h3>
    <Button
      className='gap-1.5 text-xs'
      onClick={() => openUrl(linkUrl)}
      size='sm'
      variant='ghost'>
      {linkLabel}
      <ArrowRightIcon className='size-3.5' />
    </Button>
  </header>
);
