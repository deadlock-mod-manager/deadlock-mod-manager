import {
  CubeIcon,
  CrosshairIcon,
  type Icon,
  PaletteIcon,
  PersonSimpleRunIcon,
  ScrollIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { CtaArrow, primaryCta, secondaryCta } from "@/components/home/cta";
import { DISCORD_URL, DOCS_URL } from "@/lib/constants";
import { ModHealthDemo } from "./mod-health-demo";

type RepairId = "camera" | "animations" | "appearance" | "model" | "gameData";

const REPAIRS: { id: RepairId; icon: Icon }[] = [
  { id: "camera", icon: CrosshairIcon },
  { id: "animations", icon: PersonSimpleRunIcon },
  { id: "appearance", icon: PaletteIcon },
  { id: "model", icon: CubeIcon },
  { id: "gameData", icon: ScrollIcon },
];

const FIXING_GUIDE_URL = `${DOCS_URL}/using-mod-manager/fixing-mods-after-updates`;

/** The V2 page's lead feature, laid out wider than the regular rows. */
export const ModHealthSection = () => {
  const { t } = useTranslation("v2");
  const points = Object.values(
    t("features.health.points", { returnObjects: true }),
  );

  return (
    <section
      id='health'
      className='relative isolate scroll-mt-6 border-border border-y'>
      <div
        aria-hidden='true'
        className='-z-10 absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_8%,color-mix(in_oklab,var(--color-primary)_13%,transparent),transparent_72%)]'
      />
      <div className='mx-auto max-w-7xl px-6 py-20 lg:py-24'>
        <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16'>
          <div>
            <p className='inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-semibold text-[13px] text-primary'>
              <WrenchIcon
                weight='bold'
                aria-hidden='true'
                className='size-3.5'
              />
              {t("features.health.nav")}
            </p>
            <h2 className='mt-4 max-w-[16ch] text-balance font-bold font-primary text-[clamp(36px,4.4vw,56px)] leading-[1.05] tracking-[-0.01em]'>
              {t("features.health.title")}
            </h2>
            <p className='mt-5 max-w-[54ch] text-pretty text-lg text-muted-foreground leading-relaxed'>
              {t("features.health.body")}
            </p>
            <ul className='mt-7 space-y-2.5'>
              {points.map((point) => (
                <li
                  key={point}
                  className='flex gap-3 text-[15px] text-foreground-soft leading-relaxed'>
                  <span
                    aria-hidden='true'
                    className='mt-[9px] size-1.5 shrink-0 rounded-[2px] bg-primary/80'
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <ModHealthDemo />
        </div>

        <h3 className='mt-20 font-semibold text-muted-foreground text-xs uppercase tracking-[0.08em]'>
          {t("features.health.repairsTitle")}
        </h3>
        <dl className='mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-5'>
          {REPAIRS.map(({ id, icon: RepairIcon }) => (
            <div key={id} className='border-border border-t py-5'>
              <dt className='flex items-center gap-2 font-semibold'>
                <RepairIcon
                  weight='duotone'
                  aria-hidden='true'
                  className='size-[18px] shrink-0 text-primary'
                />
                {t(`features.health.repairs.${id}.title`)}
              </dt>
              <dd className='mt-1.5 text-muted-foreground text-sm leading-relaxed'>
                {t(`features.health.repairs.${id}.body`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-3 max-w-[70ch] text-muted-foreground text-sm'>
          {t("features.health.caveat")}
        </p>

        <div className='mt-12 flex flex-col gap-6 rounded-xl border border-primary/30 bg-primary/[0.06] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between'>
          <div className='max-w-[62ch]'>
            <p className='font-bold font-primary text-2xl leading-tight'>
              {t("features.health.invite.title")}
            </p>
            <p className='mt-2 text-pretty text-foreground-soft leading-relaxed'>
              {t("features.health.invite.body")}
            </p>
          </div>
          <div className='flex shrink-0 flex-wrap items-center gap-x-8 gap-y-3'>
            <a
              href={DISCORD_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={primaryCta("lg")}>
              {t("features.health.invite.send")}
            </a>
            <a
              href={FIXING_GUIDE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={secondaryCta("lg")}>
              {t("features.health.invite.docs")}
              <CtaArrow />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
