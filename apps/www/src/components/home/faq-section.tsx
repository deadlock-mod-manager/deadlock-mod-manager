import { ChevronDown } from "@deadlock-mods/ui/icons";
import { BUG_REPORT_URL, DISCORD_URL, DOCS_URL } from "@/lib/constants";
import { Eyebrow } from "./section-heading";

const linkClassName =
  "text-primary underline underline-offset-3 transition-colors hover:text-primary-hover";

const FAQS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is Deadlock Mod Manager?",
    answer:
      "A small desktop app that makes Deadlock modding simple. Browse, install, and manage mods without touching your game folders.",
  },
  {
    question: "How do I install mods?",
    answer: (
      <ol className='list-inside list-decimal space-y-1.5'>
        <li>Download and open Deadlock Mod Manager.</li>
        <li>
          It detects Deadlock for you, or you can set the folder in Settings.
        </li>
        <li>Browse the Mods Store and click Download.</li>
        <li>The app installs the mod in the right place. No manual steps.</li>
      </ol>
    ),
  },
  {
    question: "Is it safe to use mods?",
    answer:
      "The app just copies .vpk files into your game's addons folder, never patches the Deadlock executable, and backs up first so you can restore in one click or launch vanilla any time. Skins are client-side, and the mods themselves are made by the community, so stick to ones you trust.",
  },
  {
    question: "How do I uninstall mods?",
    answer:
      "Open the Mods Library and remove what you don't want, or use Clear All Mods in Settings.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Windows and Linux. On Linux you can install from our APT repository (Ubuntu/Debian), the AUR (Arch), nixpkgs, or the Flatpak bundle.",
  },
  {
    question: "I found a bug, how do I report it?",
    answer: (
      <>
        Open an issue on our{" "}
        <a
          href={BUG_REPORT_URL}
          target='_blank'
          rel='noopener noreferrer'
          className={linkClassName}>
          GitHub repository
        </a>
        . Include steps to reproduce, what you expected, and what happened.
      </>
    ),
  },
  {
    question: "Where can I find more detailed documentation?",
    answer: (
      <>
        The{" "}
        <a
          href={DOCS_URL}
          target='_blank'
          rel='noopener noreferrer'
          className={linkClassName}>
          documentation site
        </a>{" "}
        has guides, tutorials, and technical reference.
      </>
    ),
  },
  {
    question: "Will Deadlock have official skins?",
    answer:
      "Deadlock is evolving. If official cosmetics arrive, this app will still be here for community-made options.",
  },
  {
    question: "Can other players see my installed skins?",
    answer:
      "No. These are client-side. Other players see default models and textures.",
  },
];

export const FAQSection = () => (
  <section
    id='faq'
    className='mx-auto flex max-w-7xl scroll-mt-6 flex-wrap gap-12 px-6 pt-20 pb-25'>
    <div className='min-w-0 flex-[1_1_300px]'>
      <Eyebrow>Need help?</Eyebrow>
      <h2 className='mt-2 font-bold font-primary text-[clamp(32px,3.6vw,46px)] leading-[1.08]'>
        Common questions
      </h2>
      <p className='mt-3.5 max-w-[340px] text-[15px] text-muted-foreground leading-relaxed'>
        Can't find it here? Check the{" "}
        <a
          href={`${DOCS_URL}/using-mod-manager/faq`}
          target='_blank'
          rel='noopener noreferrer'
          className={linkClassName}>
          docs
        </a>{" "}
        or ask us on{" "}
        <a
          href={DISCORD_URL}
          target='_blank'
          rel='noopener noreferrer'
          className={linkClassName}>
          Discord
        </a>
        .
      </p>
    </div>
    <div className='flex min-w-0 flex-[2_1_560px] flex-col gap-2.5'>
      {FAQS.map((faq, index) => (
        <details
          key={faq.question}
          open={index === 0}
          className='group rounded-[10px] border border-border bg-surface px-5'>
          <summary className='flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden'>
            {faq.question}
            <ChevronDown
              aria-hidden='true'
              className='size-[18px] shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180'
            />
          </summary>
          <div className='mb-[18px] max-w-[65ch] text-[15px] text-muted-foreground leading-[1.65]'>
            {faq.answer}
          </div>
        </details>
      ))}
    </div>
  </section>
);
