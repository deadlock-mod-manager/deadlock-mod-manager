import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GuideDownloadBand,
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
} from "@/components/guides/guide-page";
import { DISCORD_URL, DOCS_URL } from "@/lib/constants";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const page: GuidePageData = {
  path: "/deadlock-mods-not-working",
  name: "Deadlock mods not working",
  title:
    "Deadlock Mods Not Working After an Update? Fixes | Deadlock Mod Manager",
  description:
    "Deadlock mods stopped loading or the game crashes after a patch? Fix gameinfo.gi resets, outdated HUD mods, conflicts and mod manager issues step by step.",
  faqs: [
    {
      question: "Why did my Deadlock mods stop working after an update?",
      answer:
        "Deadlock updates usually overwrite gameinfo.gi, which removes the line that tells the game to load the addons folder. Launch modded from Deadlock Mod Manager to add it back, or re-add it by hand.",
    },
    {
      question: "Why does Deadlock crash after a patch with mods installed?",
      answer:
        "Outdated HUD and UI mods are the most common cause. Disable them, launch, and turn them back on one at a time once their authors have released updates.",
    },
    {
      question: "Why is Deadlock Mod Manager not working?",
      answer:
        "Update to the latest version first. If the app can't find the game, set the Deadlock folder in Settings. On Linux Flatpak builds, a grey screen or folder-picker crash has documented workarounds in the troubleshooting docs.",
    },
    {
      question: "Do I have to reinstall my mods after every Deadlock update?",
      answer:
        "No. Your .vpk files stay in the addons folder. Usually only gameinfo.gi needs fixing, and the app does that each time you launch modded.",
    },
  ],
};

const FIXES = [
  {
    title: "The game ignores every mod",
    cause:
      "A Deadlock update or Steam's file verification replaced gameinfo.gi, so the addons folder is no longer loaded.",
    fix: "Open Deadlock Mod Manager and use Launch modded; it re-applies the search path every time. Installed by hand? Add the two lines from the install guide back into gameinfo.gi.",
  },
  {
    title: "Crash on launch, or the HUD is broken",
    cause:
      "UI and HUD mods replace interface files Valve just changed. Old files clash with the new game.",
    fix: "Disable HUD and quality-of-life mods first, then launch. Check for mod updates in the Mods Library and re-enable them once they're updated.",
  },
  {
    title: "Some mods work, others don't",
    cause:
      "Two enabled mods change the same files and only one of them can load.",
    fix: "Open the conflicts view in Mods Library, pick which mod should win and change the load order.",
  },
  {
    title: "A mod stays stuck downloading or installing",
    cause: "An interrupted download or a file the game was holding open.",
    fix: "Close Deadlock, remove the stuck mod with its trash icon and install it again. Still stuck? Use Clear All Mods in Settings, then Analyze Local Addons to re-add what's on disk.",
  },
  {
    title: '"Access is denied" (os error 5) on Windows',
    cause: "gameinfo.gi or the addons folder is read-only.",
    fix: "Right-click the file or folder, open Properties and untick Read-only. If an old mod was installed with admin rights, run the manager as administrator once to remove it.",
  },
  {
    title: "Mods vanish when launching from Steam",
    cause:
      "The app's auto-reset option removes the mod paths when you quit, so Steam launches vanilla.",
    fix: "That's intended. Launch from Deadlock Mod Manager to play modded, or turn the option off in Settings.",
  },
];

export const Route = createFileRoute("/deadlock-mods-not-working")({
  component: ModsNotWorkingPage,
  head: () => guideHead(page),
});

function ModsNotWorkingPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Troubleshooting'
        title='Deadlock mods not working after an update?'
        intro='Most breakages after a Valve patch come down to three things: a reset gameinfo.gi, outdated HUD mods, or two mods fighting over the same files. Here is how to fix each one.'
      />

      <GuideSection title='Quick fix'>
        <div className={proseClassName}>
          <ol>
            <li>
              Update Deadlock Mod Manager to the latest version from the{" "}
              <Link to='/download'>download page</Link>.
            </li>
            <li>Check for mod updates in the Mods Library.</li>
            <li>
              Disable HUD and UI mods, then use <strong>Launch modded</strong>.
            </li>
            <li>Re-enable mods one at a time to find any that still break.</li>
          </ol>
        </div>
      </GuideSection>

      <GuideSection title='Symptoms and fixes'>
        <ul className='grid gap-4 md:grid-cols-2'>
          {FIXES.map((item) => (
            <li
              key={item.title}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-semibold text-base'>{item.title}</h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>Why: </span>
                {item.cause}
              </p>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>Fix: </span>
                {item.fix}
              </p>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title='Still stuck?'>
        <div className={proseClassName}>
          <p>
            The{" "}
            <a
              href={`${DOCS_URL}/using-mod-manager/troubleshooting`}
              target='_blank'
              rel='noopener noreferrer'>
              troubleshooting docs
            </a>{" "}
            cover Linux, Flatpak and Steam Deck issues in detail. You can also
            ask on{" "}
            <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer'>
              Discord
            </a>
            , where the community usually knows which mods broke with the latest
            patch.
          </p>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/deadlock-mods-not-working' />
      <GuideDownloadBand
        title='Patch day without the headache'
        body='Deadlock Mod Manager re-applies your mods on every launch and tells you which ones need updates.'
      />
    </div>
  );
}
