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
  path: "/deadlock-mod-manager-os-error-740",
  name: "Requires elevation (os error 740)",
  title: 'Deadlock Mod Manager "os error 740" (Requires Elevation) Fix',
  description:
    "Deadlock Mod Manager can't launch the game with os error 740 when Steam is set to run as administrator. Turn off Run as administrator for steam.exe and launch modded again.",
  faqs: [
    {
      question: "What causes os error 740 in Deadlock Mod Manager?",
      answer:
        "Windows error 740 means the requested operation requires elevation. Deadlock Mod Manager starts Deadlock through steam.exe, and if steam.exe is set to always run as administrator, Windows won't let a normal program start it.",
    },
    {
      question: "Should I run Deadlock Mod Manager as administrator instead?",
      answer:
        "It works around the error, but we don't recommend it. Mods installed while the app is elevated become admin-owned, which later causes Access is denied (os error 5) when you run it normally. Turning off the administrator setting on Steam is the cleaner fix.",
    },
    {
      question: "Does Steam need administrator rights to run Deadlock?",
      answer:
        "No. Steam and Deadlock run fine as a normal user. Steam asks for permission on its own when an install or update genuinely needs it.",
    },
    {
      question: "I get error 740 when updating the app. What now?",
      answer:
        "Download the latest installer from deadlockmods.app/download and run it over your current install. Your mods and settings are kept.",
    },
  ],
};

export const Route = createFileRoute("/deadlock-mod-manager-os-error-740")({
  component: OsError740Page,
  head: () => guideHead(page),
});

function OsError740Page() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Error fix'
        title='The requested operation requires elevation (os error 740)'
        intro='Deadlock Mod Manager launches Deadlock through Steam. When Steam is set to always run as administrator, Windows blocks a normal program from starting it and the launch fails with error 740.'>
        <ErrorMessage source='Deadlock Mod Manager on Windows, when launching the game'>
          The requested operation requires elevation. (os error 740)
        </ErrorMessage>
      </GuideHero>

      <GuideSection title='How to fix it'>
        <StepList
          columns={2}
          steps={[
            {
              title: "Quit Steam completely",
              body: "Right-click the Steam icon in the system tray and choose Exit. Closing the window isn't enough.",
            },
            {
              title: "Find steam.exe",
              body: (
                <>
                  Usually <code>C:\Program Files (x86)\Steam\steam.exe</code>.
                  Right-click it (not a shortcut) and open{" "}
                  <strong>Properties</strong>.
                </>
              ),
            },
            {
              title: "Turn off Run as administrator",
              body: (
                <>
                  On the <strong>Compatibility</strong> tab, untick{" "}
                  <strong>Run this program as an administrator</strong>. Then
                  click <strong>Change settings for all users</strong> and
                  untick it there too.
                </>
              ),
            },
            {
              title: "Check your shortcuts",
              body: "Desktop or Start menu shortcuts can have the same setting under Properties > Shortcut > Advanced. Untick Run as administrator on any you use for Steam.",
            },
            {
              title: "Start Steam normally",
              body: "Open Steam from its usual shortcut and wait for it to sign in.",
            },
            {
              title: "Launch modded again",
              body: "Back in Deadlock Mod Manager, hit Launch modded. The game should start through Steam without the error.",
            },
          ]}
        />
      </GuideSection>

      <GuideSection title='Still seeing it?'>
        <div className={proseClassName}>
          <ul>
            <li>
              Some tools set the administrator flag for you. If it comes back,
              look for "Run as administrator" options in launchers, overlays or
              tweaking tools that start Steam.
            </li>
            <li>
              If the error shows up while the app updates itself, download the
              latest installer from the{" "}
              <Link to='/download'>download page</Link> and run it over your
              current install.
            </li>
            <li>
              Running Deadlock Mod Manager as administrator also avoids the
              error, but it leads to{" "}
              <Link to='/deadlock-mod-manager-os-error-5'>
                Access is denied (os error 5)
              </Link>{" "}
              later, so treat it as a temporary workaround.
            </li>
            <li>
              Ask on{" "}
              <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer'>
                Discord
              </a>{" "}
              with a screenshot of the error and your app version.
            </li>
          </ul>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-mod-manager-os-error-740'
        guides={TROUBLESHOOTING_GUIDES}
      />
      <GuideDownloadBand
        title='One click from mods to match'
        body='Deadlock Mod Manager applies your mods and starts Deadlock through Steam for you.'
      />
    </div>
  );
}
