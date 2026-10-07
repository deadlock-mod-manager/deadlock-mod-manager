import { ChevronDown } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CtaArrow, DownloadCta, secondaryCta } from "@/components/home/cta";
import { Eyebrow } from "@/components/home/section-heading";
import { GUIDES, type Guide, type GuidePath } from "@/lib/guides";
import type { FaqEntry } from "@/utils/structured-data";

/** Body copy for guide pages: paragraphs, lists, links and inline code. */
export const proseClassName =
  "max-w-[68ch] space-y-4 text-pretty text-base text-muted-foreground leading-relaxed [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border-strong [&_a]:underline-offset-4 [&_a:hover]:decoration-primary [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-foreground [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5";

export const GuideHero = ({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation("common");

  return (
    <section className='relative isolate overflow-hidden'>
      <div aria-hidden='true' className='-z-10 absolute inset-0'>
        <div className='absolute inset-0 bg-[url(/backgrounds/bg-1.jpg)] bg-cover bg-[center_30%] opacity-25 [mask-image:radial-gradient(110%_90%_at_80%_20%,black_15%,transparent_70%)]' />
        <div className='absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,var(--color-background)_100%)]' />
      </div>
      <div className='mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24'>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className='mt-3 max-w-[20ch] text-balance font-bold font-primary text-[clamp(40px,4.6vw,64px)] leading-[1] tracking-[-0.02em]'>
          {title}
        </h1>
        <p className='mt-6 max-w-[58ch] text-pretty text-lg text-muted-foreground leading-relaxed'>
          {intro}
        </p>
        <div className='mt-10 flex flex-wrap items-center gap-x-8 gap-y-3'>
          <DownloadCta />
          <Link to='/download' className={secondaryCta("lg")}>
            {t("guidePage.allDownloads")}
            <CtaArrow />
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
};

export const GuideSection = ({
  id,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    id={id}
    className={cn("mx-auto max-w-7xl scroll-mt-6 px-6 py-12", className)}>
    <h2 className='max-w-[28ch] text-balance font-bold font-primary text-[clamp(28px,3vw,40px)] leading-[1.1]'>
      {title}
    </h2>
    {intro && (
      <p className='mt-4 max-w-[62ch] text-pretty text-base text-muted-foreground leading-relaxed'>
        {intro}
      </p>
    )}
    <div className='mt-8'>{children}</div>
  </section>
);

/** Numbered steps. Use `columns={2}` when the list has the full width. */
export const StepList = ({
  steps,
  columns = 1,
}: {
  steps: { title: string; body: React.ReactNode }[];
  columns?: 1 | 2;
}) => (
  <ol className={cn("grid gap-4", columns === 2 && "md:grid-cols-2")}>
    {steps.map((step, index) => (
      <li
        key={step.title}
        className='flex gap-4 rounded-xl border border-border bg-surface p-5'>
        <span
          aria-hidden='true'
          className='flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm'>
          {index + 1}
        </span>
        <div className='min-w-0'>
          <h3 className='font-semibold text-base'>{step.title}</h3>
          <div className='mt-1.5 text-[15px] text-muted-foreground leading-relaxed [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-background [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-foreground'>
            {step.body}
          </div>
        </div>
      </li>
    ))}
  </ol>
);

/**
 * Plain-text answers, so the same entries feed the page's FAQPage JSON-LD
 * through guideHead() without drifting from what is rendered.
 */
export const GuideFaq = ({ faqs }: { faqs: FaqEntry[] }) => {
  const { t } = useTranslation("common");

  return (
    <GuideSection id='faq' title={t("guidePage.questions")}>
      <div className='flex max-w-4xl flex-col gap-2.5'>
        {faqs.map((faq, index) => (
          <details
            key={faq.question}
            open={index === 0}
            className='group rounded-[10px] border border-border bg-surface px-5'>
            <summary className='flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden'>
              <h3>{faq.question}</h3>
              <ChevronDown
                aria-hidden='true'
                className='size-[18px] shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180'
              />
            </summary>
            <p className='mb-[18px] max-w-[65ch] text-[15px] text-muted-foreground leading-[1.65]'>
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </GuideSection>
  );
};

export const RelatedGuides = ({
  current,
  guides = GUIDES,
}: {
  current: GuidePath;
  guides?: readonly Guide[];
}) => {
  const { t } = useTranslation("common");

  return (
    <GuideSection title={t("guidePage.relatedGuides")}>
      <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {guides
          .filter((guide) => guide.path !== current)
          .map((guide) => (
            <li key={guide.path}>
              <Link
                to={guide.path}
                className='group/cta flex h-full flex-col rounded-xl border border-border bg-surface p-5 hover:border-border-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
                <span className='flex items-center justify-between gap-3 font-semibold'>
                  {t(`guides.${guide.key}.label`)}
                  <CtaArrow />
                </span>
                <span className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                  {t(`guides.${guide.key}.description`)}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </GuideSection>
  );
};

/**
 * The error text exactly as users see it, so the page matches searches that
 * paste the message.
 */
export const ErrorMessage = ({
  source,
  children,
}: {
  source: string;
  children: React.ReactNode;
}) => (
  <figure className='mt-10 max-w-3xl'>
    <figcaption className='mb-2 text-[13px] text-muted-foreground'>
      {source}
    </figcaption>
    <pre className='overflow-x-auto whitespace-pre-wrap rounded-lg border border-destructive/40 bg-surface p-4 font-mono text-[14px] text-foreground leading-relaxed'>
      {children}
    </pre>
  </figure>
);

/** An app screenshot with a caption. */
export const GuideFigure = ({
  src,
  width,
  height,
  alt,
  caption,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}) => (
  <figure>
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading='lazy'
      className='w-full rounded-xl border border-border bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.35)]'
    />
    <figcaption className='mt-3 text-[13px] text-muted-foreground'>
      {caption}
    </figcaption>
  </figure>
);
