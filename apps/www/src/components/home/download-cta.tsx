import { DISCORD_URL } from "@/lib/constants";
import { CtaArrow, DownloadCta, secondaryCta } from "./cta";

export const DownloadSection = () => (
  <section className='mx-auto max-w-7xl px-6 pb-25'>
    <div className='relative overflow-hidden rounded-2xl border border-border bg-[url(/backgrounds/bg-2.jpg)] bg-center bg-cover'>
      <div
        aria-hidden='true'
        className='absolute inset-0 bg-[linear-gradient(90deg,rgba(11,10,9,0.95)_0%,rgba(11,10,9,0.8)_45%,rgba(11,10,9,0.25)_100%)] max-md:bg-[linear-gradient(180deg,rgba(11,10,9,0.92),rgba(11,10,9,0.8))]'
      />
      <div className='relative max-w-[640px] px-[clamp(24px,5vw,64px)] py-16'>
        <p className='inline-flex items-center gap-2 font-semibold text-primary text-xs uppercase tracking-[2px]'>
          <span aria-hidden='true' className='h-px w-[18px] bg-primary' />
          Free download
        </p>
        <h2 className='mt-4 text-balance font-bold font-primary text-[clamp(40px,5vw,64px)] leading-none'>
          Set it up in about a minute
        </h2>
        <p className='mt-4 text-[17px] text-[#c9c3ba] leading-relaxed'>
          Install the app, add a few mods and hit Launch Modded.
        </p>
        <div className='mt-9 flex flex-wrap items-center gap-x-8 gap-y-3'>
          <DownloadCta />
          <a
            href={DISCORD_URL}
            target='_blank'
            rel='noopener noreferrer'
            className={secondaryCta("lg")}>
            Join the Discord
            <CtaArrow />
          </a>
        </div>
      </div>
    </div>
  </section>
);
