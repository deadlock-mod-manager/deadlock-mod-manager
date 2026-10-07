import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ErrorMessage,
  GuideDownloadBand,
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { DISCORD_URL } from "@/lib/constants";
import { TROUBLESHOOTING_GUIDES } from "@/lib/guides";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const page: GuidePageData = {
  path: "/deadlock-fatal-error-unable-to-load-layout-file",
  name: "Deadlock Fatal Error on launch",
  title: 'Deadlock "Fatal Error: Unable to Load Layout File" Fix (Mods)',
  description:
    "Fix Deadlock Fatal Error crashes caused by mods: unable to load layout file, unable to find child (IdolCashInMeter), failed to read 16 bytes, unable to load gameinfo.gi and KV3 parse errors.",
  faqs: [
    {
      question:
        "What causes Fatal Error: Unable to load layout file in Deadlock?",
      answer:
        "An outdated HUD or UI mod. These mods replace Panorama layout files, and when a Deadlock patch changes the interface, the old files no longer match. Disable your HUD and UI mods, launch, and re-enable them once they're updated.",
    },
    {
      question: "How do I fix Unable to find child IdolCashInMeter?",
      answer:
        "The same way. A HUD mod still points to an interface element that Valve renamed or removed, such as IdolCashInMeter or KothCashInMeter. Disable HUD mods until their authors release an update.",
    },
    {
      question: "What does Fatal Error: Failed to read 16 bytes mean?",
      answer:
        "The game hit a damaged or incomplete file while reading, most often a .vpk that didn't finish downloading. Remove and reinstall your most recent mods, and verify Deadlock's files in Steam if it happens with mods disabled.",
    },
    {
      question: "How do I fix Application unable to load gameinfo.gi?",
      answer:
        "gameinfo.gi is missing or was edited into an invalid state. Verify integrity of game files in Steam to restore it, then use Launch modded in Deadlock Mod Manager to add the mod paths back correctly.",
    },
    {
      question: "How do I know which mod is crashing Deadlock?",
      answer:
        "Use Launch without mods to confirm the game starts clean. Then disable half of your mods, launch modded, and keep halving the group that crashes until one mod is left.",
    },
  ],
};

const ERRORS = [
  {
    message: "Fatal Error: Unable to load layout file 'panorama/layout/…'",
    cause:
      "An outdated HUD or UI mod replaces interface files that a patch changed.",
    fix: "Disable HUD and UI mods, launch, and turn them back on once updated.",
  },
  {
    message: "Fatal Error: Unable to find child 'IdolCashInMeter'",
    cause:
      "A HUD mod references an interface element the patch renamed or removed. KothCashInMeter and similar names are the same problem.",
    fix: "Disable HUD mods until their authors publish a fix.",
  },
  {
    message: "Fatal Error: Failed to read 16 bytes",
    cause: "A damaged or half-downloaded file, usually a .vpk.",
    fix: "Remove and reinstall recently added mods. If it still crashes without mods, verify game files in Steam.",
  },
  {
    message: "Fatal Error: Application unable to load gameinfo.gi",
    cause: "gameinfo.gi is missing or was edited into an invalid state.",
    fix: "Verify game files in Steam, then Launch modded so the app re-adds the mod paths.",
  },
  {
    message: "Error parsing KV3 data",
    cause:
      "A config file in a mod, or a hand-edited gameinfo.gi, has a syntax error.",
    fix: "Disable recently added mods. If you edited gameinfo.gi by hand, paste it into the KeyValues parser to find the broken line.",
    link: "/kv-parser",
  },
] as const;

export const Route = createFileRoute(
  "/deadlock-fatal-error-unable-to-load-layout-file",
)({
  component: FatalErrorPage,
  head: () => guideHead(page),
});

function FatalErrorPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Error fix'
        title='Deadlock "Fatal Error" when launching with mods'
        intro='A Fatal Error dialog right as Deadlock starts almost always means a mod no longer matches the game, usually a HUD mod after a patch. The exact message tells you which kind.'>
        <ErrorMessage source='Deadlock, on launch'>
          Fatal Error: Unable to load layout file
        </ErrorMessage>
      </GuideHero>

      <GuideSection title='Fix it in four steps'>
        <StepList
          columns={2}
          steps={[
            {
              title: "Confirm a mod is the cause",
              body: "In Deadlock Mod Manager, use Launch without mods. If the game starts, your Deadlock install is fine and one of your mods is the problem.",
            },
            {
              title: "Update your mods",
              body: "Check the Mods Library for updates. Mod authors usually fix their HUD mods within a few days of a patch.",
            },
            {
              title: "Disable HUD and UI mods",
              body: "These cause most layout and find-child errors. Turn them off, then Launch modded again.",
            },
            {
              title: "Narrow down the rest",
              body: "Still crashing? Disable half of your remaining mods and launch. Keep halving the group that crashes until you find the one mod responsible.",
            },
          ]}
        />
      </GuideSection>

      <GuideSection
        title='Fatal errors by message'
        intro='Match the text in the error dialog.'>
        <ul className='grid gap-4 md:grid-cols-2'>
          {ERRORS.map((item) => (
            <li
              key={item.message}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {item.message}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>Why: </span>
                {item.cause}
              </p>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>Fix: </span>
                {item.fix}
              </p>
              {"link" in item && (
                <Link
                  to={item.link}
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  Open the KeyValues parser
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title='Crashes without any mods?'>
        <div className={proseClassName}>
          <p>
            If Launch without mods also crashes, the problem is in the game
            files rather than a mod. In Steam, right-click Deadlock, open{" "}
            <strong>Properties &gt; Installed Files</strong> and choose{" "}
            <strong>Verify integrity of game files</strong>. Your mods stay
            installed, and the app re-applies them the next time you launch
            modded.
          </p>
          <p>
            For mods that stopped working without a crash, see{" "}
            <Link to='/deadlock-mods-not-working'>
              Deadlock mods not working after an update
            </Link>
            . Ask on{" "}
            <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer'>
              Discord
            </a>{" "}
            to find out which mods broke with the latest patch.
          </p>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-fatal-error-unable-to-load-layout-file'
        guides={TROUBLESHOOTING_GUIDES}
      />
      <GuideDownloadBand
        title='Find the broken mod faster'
        body='Launch with or without mods in one click, see which mods have updates, and toggle them without touching the game folder.'
      />
    </div>
  );
}
