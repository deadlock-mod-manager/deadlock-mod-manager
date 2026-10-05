import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Logo from "@/components/logo";
import { showThemeInPreview } from "./app-preview/store";
import {
  getPreviewTheme,
  PREVIEW_THEMES,
  type PreviewThemeId,
} from "./app-preview/themes";
import { CtaArrow, secondaryCta } from "./cta";
import { SectionHeading } from "./section-heading";

// The light each theme casts behind the stage.
const THEME_GLOW = {
  default: "rgb(239 224 190)",
  bloodmoon: "rgb(239 68 68)",
  nightshift: "rgb(45 212 191)",
  lovelock: "rgb(255 140 192)",
  tea: "rgb(168 85 247)",
} satisfies Record<PreviewThemeId, string>;

const AUTO_CYCLE_MS = 4200;
const REVEAL_MS = 950;

type Reveal = { id: PreviewThemeId; x: number; y: number };

interface GlowStyle extends React.CSSProperties {
  "--theme-glow": string;
}

const loadImage = (src: string) => {
  const image = new Image();
  image.src = src;
  return image.decode().catch(() => undefined);
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One large app window that repaints itself when a theme is picked: the new
 * theme spreads out as a circle from the swatch that was clicked.
 */
export const ThemesSection = () => {
  const [current, setCurrent] = useState<PreviewThemeId>("bloodmoon");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLImageElement>(null);
  const swatchRefs = useRef(new Map<PreviewThemeId, HTMLButtonElement>());

  const selected = reveal?.id ?? current;

  const paint = async (id: PreviewThemeId) => {
    if (id === selected) return;
    // A repaint already in flight lands instantly so the next one starts clean.
    if (reveal) setCurrent(reveal.id);

    const stage = stageRef.current;
    const swatch = swatchRefs.current.get(id);
    if (!stage || !swatch || prefersReducedMotion()) {
      setReveal(null);
      setCurrent(id);
      return;
    }

    await loadImage(getPreviewTheme(id).preview);
    const stageBox = stage.getBoundingClientRect();
    const swatchBox = swatch.getBoundingClientRect();
    setReveal({
      id,
      x: swatchBox.left + swatchBox.width / 2 - stageBox.left,
      y: swatchBox.top + swatchBox.height / 2 - stageBox.top,
    });
  };

  useLayoutEffect(() => {
    const layer = revealRef.current;
    const stage = stageRef.current;
    if (!reveal || !layer || !stage) return;

    const { width, height } = stage.getBoundingClientRect();
    const radius = Math.hypot(
      Math.max(reveal.x, width - reveal.x),
      Math.max(reveal.y, height - reveal.y),
    );
    const animation = layer.animate(
      [
        { clipPath: `circle(0px at ${reveal.x}px ${reveal.y}px)` },
        { clipPath: `circle(${radius}px at ${reveal.x}px ${reveal.y}px)` },
      ],
      { duration: REVEAL_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
    );
    let cancelled = false;
    animation.finished
      .then(() => {
        if (cancelled) return;
        setCurrent(reveal.id);
        setReveal(null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      animation.cancel();
    };
  }, [reveal]);

  // Warm the other themes' images once the section is close to the viewport.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) {
          for (const theme of PREVIEW_THEMES) loadImage(theme.preview);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Cycle slowly on its own until the visitor picks something.
  useEffect(() => {
    if (interacted || !inView || prefersReducedMotion()) return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      const index = PREVIEW_THEMES.findIndex((theme) => theme.id === selected);
      paint(PREVIEW_THEMES[(index + 1) % PREVIEW_THEMES.length].id);
    }, AUTO_CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [interacted, inView, selected]);

  const selectedTheme = getPreviewTheme(selected);
  const glowStyle: GlowStyle = { "--theme-glow": THEME_GLOW[selected] };

  return (
    <section
      ref={sectionRef}
      id='themes'
      className='mx-auto max-w-7xl scroll-mt-6 px-6 pt-20 pb-10 lg:pt-25'>
      <SectionHeading
        title='Change how the app looks'
        description='Pick one of the community themes, or make your own in the theme builder and share the file with friends.'
      />

      <div className='theme-stage relative mt-12' style={glowStyle}>
        <div
          aria-hidden='true'
          className='theme-stage-glow -inset-x-16 -inset-y-20 pointer-events-none absolute'
        />
        <div
          ref={stageRef}
          className='relative aspect-[1232/761] overflow-hidden rounded-2xl border border-white/10 bg-background shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]'>
          <img
            src={getPreviewTheme(current).preview}
            alt={`Deadlock Mod Manager in the ${selectedTheme.name} theme`}
            width={1232}
            height={761}
            loading='lazy'
            className='absolute inset-0 size-full object-cover'
          />
          {reveal && (
            <img
              ref={revealRef}
              src={getPreviewTheme(reveal.id).preview}
              alt=''
              width={1232}
              height={761}
              className='absolute inset-0 size-full object-cover'
              style={{
                clipPath: `circle(0px at ${reveal.x}px ${reveal.y}px)`,
              }}
            />
          )}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          />
        </div>
      </div>

      <div className='mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-5'>
        <div
          role='radiogroup'
          aria-label='Theme'
          className='-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]'>
          {PREVIEW_THEMES.map((theme) => {
            const isSelected = theme.id === selected;
            return (
              <button
                key={theme.id}
                ref={(node) => {
                  if (node) swatchRefs.current.set(theme.id, node);
                  else swatchRefs.current.delete(theme.id);
                }}
                type='button'
                role='radio'
                aria-checked={isSelected}
                onClick={() => {
                  setInteracted(true);
                  paint(theme.id);
                }}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2.5 rounded-lg border pr-4 pl-2 font-medium text-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
                  isSelected
                    ? "border-border-hover bg-surface text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}>
                <span
                  className='flex size-7 shrink-0 items-center justify-center rounded-full'
                  style={{
                    // The selected swatch is ringed in its theme's own light.
                    boxShadow: isSelected
                      ? `0 0 0 2px var(--color-background), 0 0 0 4px ${THEME_GLOW[theme.id]}`
                      : undefined,
                  }}>
                  {theme.icon ? (
                    <img
                      src={theme.icon}
                      alt=''
                      width={28}
                      height={28}
                      className='size-7 rounded-full object-contain'
                    />
                  ) : (
                    <Logo className='size-7' />
                  )}
                </span>
                {theme.name}
              </button>
            );
          })}
        </div>
        <button
          type='button'
          onClick={() => showThemeInPreview(selected)}
          className={secondaryCta("sm")}>
          Try {selectedTheme.name} in the preview
          <CtaArrow />
        </button>
      </div>
      <p className='mt-3 text-[13px] text-foreground-subtle'>
        {selectedTheme.description} You'll find the theme builder in Settings.
      </p>
    </section>
  );
};
