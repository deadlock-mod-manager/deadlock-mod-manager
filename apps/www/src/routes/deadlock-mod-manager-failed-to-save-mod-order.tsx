import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ErrorMessage,
  GuideDownloadBand,
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
} from "@/components/guides/guide-page";
import { DISCORD_URL } from "@/lib/constants";
import { TROUBLESHOOTING_GUIDES } from "@/lib/guides";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const page: GuidePageData = {
  path: "/deadlock-mod-manager-failed-to-save-mod-order",
  name: "Failed to save mod order",
  title: 'Deadlock Mod Manager "Failed to Save Mod Order" Fix',
  description:
    "Getting Failed to save mod order in Deadlock Mod Manager? Close Deadlock, release locked .vpk files and fix folder permissions, then save the load order again.",
  faqs: [
    {
      question: "Why does Deadlock Mod Manager fail to save my mod order?",
      answer:
        "Saving the order renames the .vpk files in your addons folder so the game loads them in the new order. It fails when Deadlock is running, when another program has a .vpk open, or when Windows denies access to the folder.",
    },
    {
      question: "Do I lose my mods when saving the order fails?",
      answer:
        "No. The app rolls the rename back when a step fails, so your mods stay installed in their previous order. Fix the cause and save again.",
    },
    {
      question: "Can I change the load order while Deadlock is open?",
      answer:
        "No. The game keeps its .vpk files open while it runs, so close Deadlock first. Changes apply the next time you launch modded.",
    },
    {
      question: "What does mod order actually change?",
      answer:
        "When two mods replace the same file, only one version can load, and the mod order decides which one. Mods that don't overlap work the same in any order.",
    },
  ],
};

const CAUSES = [
  {
    message: "Game is running",
    fix: "Quit Deadlock completely, including from the system tray, then save the order again. If the game already closed, wait a few seconds for the process to exit.",
  },
  {
    message:
      "The process cannot access the file because it is being used by another process. (os error 32)",
    fix: "Another program has a .vpk open. Close File Explorer windows showing the addons folder, VPK viewers and archive tools. Antivirus scans can hold files briefly, so retry after a few seconds or add the Deadlock folder to its exclusions.",
  },
  {
    message: "VPK files are in use and cannot be deleted",
    fix: "Same cause as above: close the game and any program that has the mod files open, then try again.",
  },
  {
    message: "Access is denied. (os error 5)",
    fix: "Windows is blocking changes to the addons folder. Follow the os error 5 guide to clear read-only flags and permission problems.",
    link: "/deadlock-mod-manager-os-error-5",
  },
  {
    message: "All addon shard folders are full",
    fix: "You have more enabled .vpk files than the game can load. Disable mods you don't use, then save the order again.",
  },
] as const;

export const Route = createFileRoute(
  "/deadlock-mod-manager-failed-to-save-mod-order",
)({
  component: FailedToSaveModOrderPage,
  head: () => guideHead(page),
});

function FailedToSaveModOrderPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Error fix'
        title='Failed to save mod order'
        intro='Saving the load order renames your mod files so Deadlock loads them in the new order. When a file is locked or protected, the rename is rolled back and the app shows this error. The message under it tells you why.'>
        <ErrorMessage source='Deadlock Mod Manager, after saving in Manage Mod Load Order'>
          Failed to save mod order
        </ErrorMessage>
      </GuideHero>

      <GuideSection
        title='Find your message, apply the fix'
        intro='Read the line under "Failed to save mod order" in the notification and match it below.'>
        <ul className='grid gap-4 md:grid-cols-2'>
          {CAUSES.map((cause) => (
            <li
              key={cause.message}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {cause.message}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                {cause.fix}
              </p>
              {"link" in cause && (
                <Link
                  to={cause.link}
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  Fix os error 5
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title='If nothing matches'>
        <div className={proseClassName}>
          <ol>
            <li>Close Deadlock and restart Deadlock Mod Manager.</li>
            <li>
              Open Mods Library and check every mod finished installing. Remove
              and reinstall any that look stuck.
            </li>
            <li>Click Change Mods Order again and save.</li>
            <li>
              Still failing? Share the full message and your app version on{" "}
              <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer'>
                Discord
              </a>
              .
            </li>
          </ol>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-mod-manager-failed-to-save-mod-order'
        guides={TROUBLESHOOTING_GUIDES}
      />
      <GuideDownloadBand
        title='Drag mods into the order you want'
        body='Deadlock Mod Manager shows which mods conflict and lets you pick the winner by reordering them.'
      />
    </div>
  );
}
