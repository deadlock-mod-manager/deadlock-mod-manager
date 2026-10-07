import { createFileRoute } from "@tanstack/react-router";
import {
  GuideDownloadBand,
  GuideFaq,
  GuideFigure,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { PREVIEW_MODS } from "@/components/home/app-preview/mods";
import { ModCard } from "@/components/home/mod-card";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const GAMEBANANA_DEADLOCK_URL = "https://gamebanana.com/games/20948";

const page: GuidePageData = {
  path: "/mods",
  name: "Deadlock mods",
  title:
    "Deadlock Mods: Download & Install GameBanana Mods | Deadlock Mod Manager",
  description:
    "Browse every Deadlock mod on GameBanana, from hero skins to HUD and quality-of-life mods, and install them in one click with the free Deadlock Mod Manager.",
  faqs: [
    {
      question: "Where can I download Deadlock mods?",
      answer:
        "GameBanana hosts nearly all Deadlock mods. Deadlock Mod Manager browses the GameBanana catalog inside the app, so you can search, preview and install a mod without visiting the site or handling zip files.",
    },
    {
      question: "Do I need to install Deadlock mods manually?",
      answer:
        "No. The app downloads the mod, extracts it, copies the .vpk files into the game's addons folder and sets up gameinfo.gi for you. You can still install mods by hand if you prefer; the install guide covers both ways.",
    },
    {
      question: "Are Deadlock mods free?",
      answer:
        "Yes. Mods on GameBanana are made and shared for free by the community, and Deadlock Mod Manager is free and open source.",
    },
    {
      question: "Can other players see my mods?",
      answer:
        "No. Skins, HUD changes and sounds are client-side. Other players see the default game.",
    },
    {
      question: "Do mods still work after a Deadlock update?",
      answer:
        "Most do. Valve patches sometimes break HUD and UI mods until their authors update them. Check for mod updates in the Mods Library, or launch vanilla until a fix lands.",
    },
  ],
};

const topMods = [...PREVIEW_MODS]
  .sort((a, b) => b.downloads - a.downloads)
  .slice(0, 8);

const CATEGORIES = [
  {
    title: "Hero skins",
    body: "Remodels and recolors for every hero, grouped by hero so you can swap the active skin in a click.",
  },
  {
    title: "HUD & quality of life",
    body: "Cleaner top bars, always-visible item icons and other interface tweaks, like QOL Lock.",
  },
  {
    title: "Sounds",
    body: "Ability, announcer and music replacements. Toggle them separately from skins.",
  },
  {
    title: "Works in progress",
    body: "Early releases from modders, in their own section so they never surprise you.",
  },
];

export const Route = createFileRoute("/mods")({
  component: ModsPage,
  head: () => guideHead(page),
});

function ModsPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Deadlock mods'
        title='Every Deadlock mod, one click away'
        intro='Deadlock Mod Manager browses the whole GameBanana catalog for you: skins, HUD and quality-of-life mods, sounds and more. Pick a mod, hit download, and the app puts it in the right place.'
      />

      <GuideSection
        title='Popular Deadlock mods right now'
        intro='The most downloaded mods in the Mods Store. Each one opens its GameBanana page, and all of them install from inside the app.'>
        <ul className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4'>
          {topMods.map((mod) => (
            <li key={mod.id}>
              <ModCard mod={mod} showDownloads />
            </li>
          ))}
        </ul>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          Snapshot from October 2026. Download counts come from GameBanana.
        </p>
      </GuideSection>

      <GuideSection title='What you can install'>
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {CATEGORIES.map((category) => (
            <li
              key={category.title}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-semibold'>{category.title}</h3>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                {category.body}
              </p>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title='From GameBanana to your game in four steps'>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'>
          <StepList
            steps={[
              {
                title: "Install the app",
                body: "Download Deadlock Mod Manager for Windows or Linux. It finds your Deadlock install on its own.",
              },
              {
                title: "Find a mod",
                body: "Search the Mods Store, filter by hero or category and sort by downloads, rating or last update.",
              },
              {
                title: "Download it",
                body: "Choose a variant if the mod has several. The app extracts and installs it for you.",
              },
              {
                title: "Launch modded",
                body: "Hit Launch modded. Want the plain game? Pick Launch without mods; nothing gets uninstalled.",
              },
            ]}
          />
          <GuideFigure
            src='/home/app/store-1x.webp'
            width={1232}
            height={761}
            alt='The Deadlock Mod Manager Mods Store listing GameBanana mods with hero and category filters'
            caption='The Mods Store: every Deadlock submission on GameBanana, with filters.'
          />
        </div>
      </GuideSection>

      <GuideSection title='GameBanana Deadlock mods, without the busywork'>
        <div className={proseClassName}>
          <p>
            <a
              href={GAMEBANANA_DEADLOCK_URL}
              target='_blank'
              rel='noopener noreferrer'>
              GameBanana
            </a>{" "}
            is where the Deadlock modding community publishes its work, and it's
            a partner of Deadlock Mod Manager. Installing from the site by hand
            means downloading an archive, finding the right <code>.vpk</code>,
            renaming it so it doesn't clash with your other mods, and editing{" "}
            <code>gameinfo.gi</code>.
          </p>
          <p>
            The app does all of that, and keeps going after the install: it
            warns you when two mods change the same files, checks for updates,
            keeps separate profiles for different setups and backs up your
            addons first so you can roll back.
          </p>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/mods' />
      <GuideDownloadBand
        title='Start modding Deadlock'
        body='Free and open source, for Windows and Linux. Your first mod is a couple of clicks away.'
      />
    </div>
  );
}
