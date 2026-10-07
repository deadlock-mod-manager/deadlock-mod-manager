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
import { DOCS_URL } from "@/lib/constants";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const page: GuidePageData = {
  path: "/skins",
  name: "Deadlock skins",
  title: "Deadlock Skins: Custom Hero Skin Mods | Deadlock Mod Manager",
  description:
    "Install custom Deadlock hero skins from GameBanana, preview them in 3D and switch back to the default look any time. Free, with the open-source Deadlock Mod Manager.",
  faqs: [
    {
      question: "How do I get skins in Deadlock?",
      answer:
        "Deadlock has no skin shop yet, so skins come from the modding community on GameBanana. Install Deadlock Mod Manager, filter the Mods Store by Skins and your hero, download a skin, then pick it in Hero Skins.",
    },
    {
      question: "Can other players see my Deadlock skins?",
      answer:
        "No. Skins are client-side. You see the new model, everyone else sees the default one.",
    },
    {
      question: "Are Deadlock skins free?",
      answer:
        "Yes. Community skins on GameBanana are free, and so is Deadlock Mod Manager.",
    },
    {
      question: "How do I go back to a hero's default skin?",
      answer:
        "Open Hero Skins, pick the hero and choose the default appearance. The skin stays downloaded, so you can switch back later.",
    },
    {
      question: "Can I use more than one skin for the same hero?",
      answer:
        "One skin is active per hero at a time, and the app warns you if two would clash. You can also give a hero several skins and get a random pick on every launch.",
    },
    {
      question: "Will Deadlock have official skins?",
      answer:
        "Valve hasn't released official cosmetics yet. If they arrive, community skins will still be available through the app.",
    },
  ],
};

const skins = PREVIEW_MODS.filter((mod) => mod.category === "Skins").sort(
  (a, b) => b.downloads - a.downloads,
);

export const Route = createFileRoute("/skins")({
  component: SkinsPage,
  head: () => guideHead(page),
});

function SkinsPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Deadlock skins'
        title='Custom skins for every Deadlock hero'
        intro='Remodels, recolors and full overhauls made by the community. Deadlock Mod Manager groups them by hero, shows them in 3D and swaps them in a click.'
      />

      <GuideSection
        title='Popular hero skins'
        intro='Community skins from the Mods Store. Each card opens the skin on GameBanana; install it from the app.'>
        <ul className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4'>
          {skins.map((mod) => (
            <li key={mod.id}>
              <ModCard mod={mod} showDownloads />
            </li>
          ))}
        </ul>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          Snapshot from October 2026. Download counts come from GameBanana.
        </p>
      </GuideSection>

      <GuideSection title='How to install a Deadlock skin'>
        <StepList
          columns={2}
          steps={[
            {
              title: "Get Deadlock Mod Manager",
              body: "Install it on Windows or Linux. It detects your game folder on its own.",
            },
            {
              title: "Filter by hero",
              body: "In the Mods Store, include the Skins category and the hero you play.",
            },
            {
              title: "Download the skin",
              body: "If the skin comes in several styles, pick the variant you want.",
            },
            {
              title: "Set it in Hero Skins",
              body: "Choose the active skin for that hero, check it in the 3D preview, then hit Launch modded.",
            },
          ]}
        />
      </GuideSection>

      <GuideSection title='Make your own skin'>
        <div className='grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'>
          <div className={proseClassName}>
            <p>
              The <strong>Mod Foundry</strong> loads a hero model from the base
              game or from a skin you own. Paint it, swap sounds, preview it in
              3D and export a ready-to-install mod.
            </p>
            <p>
              Exports can be saved as a file, added to your library as a new
              mod, or replace the skin you started from (the original is kept as
              a backup).{" "}
              <a
                href={`${DOCS_URL}/using-mod-manager/customization`}
                target='_blank'
                rel='noopener noreferrer'>
                Read the Mod Foundry guide
              </a>
              .
            </p>
          </div>
          <GuideFigure
            src='/home/screens/mod-foundry.webp'
            width={1199}
            height={825}
            alt='The Mod Foundry skin editor in Deadlock Mod Manager, showing a hero model with paint and sound tools'
            caption='Mod Foundry: edit a hero skin and export it as a mod.'
          />
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/skins' />
      <GuideDownloadBand
        title='Give your hero a new look'
        body='Free and open source, for Windows and Linux. Skins are client-side, and the default model is always one click away.'
      />
    </div>
  );
}
