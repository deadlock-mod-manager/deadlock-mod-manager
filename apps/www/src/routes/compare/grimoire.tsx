import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon } from "@phosphor-icons/react";
import {
  GuideDownloadBand,
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { AppPreview } from "@/components/home/app-preview";
import { PREVIEW_THEMES } from "@/components/home/app-preview/themes";
import { GITHUB_REPO } from "@/lib/constants";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const GRIMOIRE_SITE = "https://grimoiredeadlock.com/";

const page: GuidePageData = {
  path: "/compare/grimoire",
  name: "Deadlock Mod Manager vs Grimoire",
  title: "Deadlock Mod Manager vs Grimoire: Which Deadlock Mod Manager?",
  description:
    "Deadlock Mod Manager and Grimoire cover the same features since V2, so the choice comes down to which interface you prefer. Try ours live and import your Grimoire setup in a minute.",
  faqs: [
    {
      question: "Which is better, Deadlock Mod Manager or Grimoire?",
      answer:
        "Since Deadlock Mod Manager V2, both apps cover the same ground: GameBanana installs, conflicts and load order, shareable profiles, hero skins with 3D previews, crosshairs, autoexec and match stats. Pick the interface you like using. You can try Deadlock Mod Manager's in the live preview on this page.",
    },
    {
      question: "Is Grimoire the same as Deadlock Mod Manager?",
      answer:
        "No, they are separate open-source projects, but they share roots. Deadlock Mod Manager started in December 2024 and Grimoire a year later. Grimoire took cues from Deadlock Mod Manager, and several Deadlock Mod Manager contributors have since helped build Grimoire too.",
    },
    {
      question: "Can I switch from Grimoire to Deadlock Mod Manager?",
      answer:
        "Yes, in about a minute. Open the Mods Library, choose Import from other mod managers and pick Grimoire. Deadlock Mod Manager finds your Grimoire library and brings over your mods with their enabled state and load order, your profiles and your crosshairs. Nothing in Grimoire is changed.",
    },
    {
      question: "Can I go back to Grimoire, or use both?",
      answer:
        "Yes. Both apps read and write the same mod-interchange format, so you can export from Deadlock Mod Manager and import into Grimoire, or move back and forth while you decide.",
    },
    {
      question: "Are both mod managers safe?",
      answer:
        "Both are open source, so anyone can read the code. Deadlock Mod Manager's Windows installer is code-signed through SignPath. Grimoire's README says its Windows installers are not code-signed yet and publishes SHA256 checksums instead.",
    },
  ],
};

/** What both apps do since Deadlock Mod Manager V2. */
const SHARED = [
  "Browse and install GameBanana mods in-app",
  "Sounds alongside mods",
  "Conflict detection and load order",
  "Shareable mod profiles",
  "Import from the other app",
  "Hero skins with a 3D preview",
  "Launch modded or vanilla",
  "Crosshair editor and autoexec",
  "Match stats from deadlock-api",
  "Windows and Linux builds",
  "Free and open source",
];

/** The few differences that aren't about the interface. */
const SMALL_PRINT = [
  {
    title: "Windows installer",
    body: "Ours is code-signed through SignPath. Grimoire's README says its installers aren't signed yet, so Windows shows an \"Unknown publisher\" warning.",
  },
  {
    title: "Linux packages",
    body: "We ship an apt repo, .deb, RPM, Flatpak, AUR, nixpkgs and Gentoo. Grimoire ships an AppImage, .deb, an apt repo, AUR and a Nix flake.",
  },
  {
    title: "Under the hood",
    body: "Deadlock Mod Manager is built on Tauri and uses your system's webview. Grimoire is an Electron app that bundles its own Chromium.",
  },
];

/** Checked against both repositories' commit history in October 2026. */
const ROOTS_STATS = [
  { label: "Deadlock Mod Manager started", value: "Dec 2024" },
  { label: "Grimoire started", value: "Dec 2025" },
  {
    label: "People who have contributed to Deadlock Mod Manager",
    value: "30+",
  },
  {
    label: "Core Deadlock Mod Manager contributors who have worked on Grimoire",
    value: "2",
  },
];

export const Route = createFileRoute("/compare/grimoire")({
  component: CompareGrimoirePage,
  head: () => guideHead(page),
});

function CompareGrimoirePage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Comparison'
        title='Deadlock Mod Manager vs Grimoire'
        intro="Both apps do the job well, so pick the one you'd rather open before every match. You can try ours on this page and bring your Grimoire setup over in about a minute."
      />

      <GuideSection
        title='Feature for feature, it’s (almost) a tie'
        intro="Both apps cover what most players need. We think ours has a few extras and a bit more polish, but we're biased. If you're looking for a specific feature, it's probably on this list, and both apps have it.">
        <ul className='grid gap-x-8 gap-y-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2 sm:p-8'>
          {SHARED.map((feature) => (
            <li key={feature} className='flex items-start gap-3'>
              <CheckIcon
                aria-hidden='true'
                weight='bold'
                className='mt-1 size-4 shrink-0 text-primary'
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection id='roots' title='Why they feel so alike'>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'>
          <div className={proseClassName}>
            <p>
              Deadlock Mod Manager came first. Starting in December 2024, it
              turned the community's manual modding know-how into one app:
              GameBanana installs, <code>gameinfo.gi</code> set up for you, and
              launching modded or vanilla. Over the next year it added Linux
              support, sound mods, shareable profiles and themes, and the
              community helped polish all of it.
            </p>
            <p>
              Grimoire started in December 2025 and took plenty of cues from
              what worked in Deadlock Mod Manager. We took that as a compliment
              and pitched in. Core Deadlock Mod Manager contributors have helped
              build Grimoire too, which is part of why moving between the two
              apps is easy.
            </p>
          </div>
          <dl className='grid grid-cols-2 gap-4'>
            {ROOTS_STATS.map((stat) => (
              <div
                key={stat.label}
                className='rounded-xl border border-border bg-surface p-5'>
                <dt className='text-muted-foreground text-sm'>{stat.label}</dt>
                <dd className='mt-1 font-bold font-primary text-2xl'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </GuideSection>

      <GuideSection
        title='So it comes down to the interface'
        intro='Both apps are customizable, in different ways.'>
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
          <div className='rounded-2xl border border-border-strong bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              Deadlock Mod Manager: switch whole themes
            </h3>
            <p className='mt-3 max-w-[56ch] text-muted-foreground leading-relaxed'>
              Each theme is a complete look with its own colors, and most add
              their own artwork and sidebar logo, from the gold default to
              Bloodmoon's crimson. Switch with one click, or use the Background
              plugin to set your own image. The mod library is a dense list,
              which helps once you have a lot of mods.
            </p>
            <ul className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3'>
              {PREVIEW_THEMES.map((theme) => (
                <li key={theme.id}>
                  <figure>
                    <img
                      src={theme.preview}
                      alt={`Deadlock Mod Manager with the ${theme.name} theme`}
                      width={1232}
                      height={761}
                      loading='lazy'
                      className='aspect-[1232/761] w-full rounded-lg border border-border object-cover'
                    />
                    <figcaption className='mt-1.5 text-[13px] text-muted-foreground'>
                      {theme.name}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
          <div className='rounded-2xl border border-border bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              Grimoire: tune one look
            </h3>
            <p className='mt-3 text-muted-foreground leading-relaxed'>
              A dark interface with big image cards that you adjust piece by
              piece:
            </p>
            <ul className='mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed'>
              <li>Eight accent colors, or any custom color</li>
              <li>An OLED black mode</li>
              <li>A colored background glow</li>
              <li>
                Hero art or your own images behind the launch buttons and active
                tab
              </li>
            </ul>
            <a
              href={GRIMOIRE_SITE}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-6 inline-block font-medium text-foreground text-sm underline decoration-border-strong underline-offset-4 hover:decoration-primary'>
              See Grimoire's screenshots
            </a>
          </div>
        </div>
      </GuideSection>

      <GuideSection
        id='try-it'
        title='Try ours before you download'
        intro='This is a working copy of the app. Install a mod, hit launch, or pick a theme under Settings → Themes.'>
        <div className='hidden rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:block'>
          <AppPreview />
        </div>
        <ul className='grid gap-3 md:hidden'>
          {PREVIEW_THEMES.slice(0, 2).map((theme) => (
            <li key={theme.id}>
              <img
                src={theme.preview}
                alt={`Deadlock Mod Manager with the ${theme.name} theme`}
                width={1232}
                height={761}
                loading='lazy'
                className='w-full rounded-xl border border-border'
              />
            </li>
          ))}
          <li className='text-foreground-subtle text-xs'>
            On a PC you can click through the live preview right here.
          </li>
        </ul>
      </GuideSection>

      <GuideSection
        id='switch'
        title='Bring your Grimoire setup with you'
        intro="Deadlock Mod Manager imports your Grimoire library directly, so you don't reinstall mods or rebuild profiles.">
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
          <StepList
            steps={[
              {
                title: "Install Deadlock Mod Manager",
                body: (
                  <>
                    Get it from the <Link to='/download'>download page</Link>.
                    Keep Grimoire installed; nothing in it is changed.
                  </>
                ),
              },
              {
                title: "Open the import",
                body: "In the Mods Library, choose Import from other mod managers. Grimoire is detected automatically, or you can point to its data folder.",
              },
              {
                title: "Pick what comes over",
                body: "Mods keep their enabled state and load order. Profiles become DMM profiles with the same mods, and crosshairs land in your crosshair history.",
              },
              {
                title: "Play",
                body: "Mods the app can't match are imported as local mods; identify them to get updates, or leave them as they are. Then hit Launch modded.",
              },
            ]}
          />
          <div className='rounded-2xl border border-border-strong bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              No lock-in, either way
            </h3>
            <div className={`${proseClassName} mt-3`}>
              <p>
                Deadlock Mod Manager and Grimoire both support the open{" "}
                <strong>mod-interchange</strong> format. Export your mods,
                profiles and crosshairs from one app and import them into the
                other.
              </p>
              <p>
                Changed something in Grimoire after importing? Run the import
                again: mods you already have are matched and updated in place,
                not duplicated.
              </p>
              <p>Try both and keep the one you like.</p>
            </div>
          </div>
        </div>
      </GuideSection>

      <GuideSection title='The small print'>
        <dl className='grid gap-4 md:grid-cols-3'>
          {SMALL_PRINT.map((item) => (
            <div
              key={item.title}
              className='rounded-xl border border-border bg-surface p-5'>
              <dt className='font-semibold'>{item.title}</dt>
              <dd className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          Based on each project's README, docs and releases in October 2026.
          Spotted something out of date?{" "}
          <a
            href={`${GITHUB_REPO}/issues`}
            target='_blank'
            rel='noopener noreferrer'
            className='underline underline-offset-4'>
            Let us know
          </a>
          .
        </p>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/compare/grimoire' />
      <GuideDownloadBand
        title='Try Deadlock Mod Manager'
        body='Free, open source and signed on Windows. Your Grimoire mods, profiles and crosshairs come with you.'
      />
    </div>
  );
}
