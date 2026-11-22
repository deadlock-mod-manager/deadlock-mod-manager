import { cn } from "@/lib/utils";

/**
 * GameBanana's pixel banana. The art is a 16px grid, so render it at
 * multiples of 16 to keep the pixels sharp.
 */
export const GameBananaLogo = ({ className }: { className?: string }) => (
  <img
    alt=''
    aria-hidden
    className={cn("size-4 shrink-0 [image-rendering:pixelated]", className)}
    draggable={false}
    src='/brand/gamebanana.png'
  />
);

// Outline of the same banana, traced cell for cell, for one-colour UI icons.
// The viewBox pads it like Phosphor's glyphs so it matches them at the same size.
const BANANA_OUTLINE =
  "M10 0h3v1H10zM10 1h1v1H10zM12 1h1v1H12zM11 2h3v1H11zM11 3h1v1H11zM14 3h1v1H14zM11 4h1v1H11zM15 4h1v1H15zM10 5h1v1H10zM15 5h1v1H15zM10 6h1v1H10zM15 6h1v1H15zM10 7h1v1H10zM15 7h1v1H15zM9 8h1v1H9zM15 8h1v1H15zM6 9h3v1H6zM15 9h1v1H15zM0 10h6v1H0zM15 10h1v1H15zM0 11h1v1H0zM14 11h1v1H14zM0 12h1v1H0zM14 12h1v1H14zM1 13h1v1H1zM13 13h1v1H13zM2 14h2v1H2zM11 14h2v1H11zM4 15h7v1H4z";

export const GameBananaIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    className={cn("size-3.5 shrink-0", className)}
    fill='currentColor'
    viewBox='-1 -1 18 18'>
    <path d={BANANA_OUTLINE} />
  </svg>
);
