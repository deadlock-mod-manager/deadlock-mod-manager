import {
  heroIcon,
  modThumbnail,
  modUrl,
  type PreviewMod,
} from "./app-preview/mods";

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

const modKind = (mod: PreviewMod) =>
  mod.hero ? `${mod.hero} skin` : mod.category;

/** A community mod from the store snapshot, linked to its GameBanana page. */
export const ModCard = ({
  mod,
  showDownloads = false,
}: {
  mod: PreviewMod;
  showDownloads?: boolean;
}) => (
  <a
    href={modUrl(mod)}
    target='_blank'
    rel='noopener noreferrer'
    className='group block overflow-hidden rounded-xl border border-border bg-surface hover:border-border-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
    <span className='block overflow-hidden'>
      <img
        src={modThumbnail(mod)}
        alt={
          mod.hero
            ? `${mod.name}, ${mod.hero} skin for Deadlock`
            : `${mod.name}, a Deadlock ${mod.category.toLowerCase()} mod`
        }
        width={480}
        height={360}
        loading='lazy'
        className='aspect-[4/3] w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]'
      />
    </span>
    <span className='flex items-start gap-2.5 p-3'>
      {mod.hero && (
        <img
          src={heroIcon(mod.hero)}
          alt=''
          width={28}
          height={28}
          loading='lazy'
          className='size-7 shrink-0 rounded-full bg-background'
        />
      )}
      <span className='min-w-0'>
        <span className='block truncate font-semibold text-sm'>{mod.name}</span>
        <span className='block truncate text-muted-foreground text-xs'>
          {modKind(mod)} by {mod.author}
          {showDownloads &&
            ` · ${compactNumber.format(mod.downloads)} downloads`}
        </span>
      </span>
    </span>
  </a>
);
