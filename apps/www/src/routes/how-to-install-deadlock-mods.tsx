import { createFileRoute, Link } from "@tanstack/react-router";
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
import { DOCS_URL } from "@/lib/constants";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const page: GuidePageData = {
  path: "/how-to-install-deadlock-mods",
  name: "How to install Deadlock mods",
  title: "How to Install Deadlock Mods (2026 Guide) | Deadlock Mod Manager",
  description:
    "How to mod Deadlock step by step: install mods from GameBanana in one click with Deadlock Mod Manager, or by hand with the addons folder and gameinfo.gi.",
  faqs: [
    {
      question: "How do I mod Deadlock?",
      answer:
        "Install Deadlock Mod Manager, let it find your game, then download mods from the Mods Store and hit Launch modded. The app handles the addons folder and gameinfo.gi for you.",
    },
    {
      question: "Where is the Deadlock addons folder?",
      answer:
        "Inside your Deadlock install at game/citadel/addons. On Windows that's usually C:\\Program Files (x86)\\Steam\\steamapps\\common\\Deadlock\\game\\citadel\\addons. Create the addons folder if it doesn't exist.",
    },
    {
      question: "Why do I need to edit gameinfo.gi?",
      answer:
        "Deadlock only loads files from the addons folder when gameinfo.gi lists it as a search path. Without that line the game ignores your mods. Deadlock Mod Manager adds it when you launch modded.",
    },
    {
      question: "How do I uninstall Deadlock mods?",
      answer:
        "In the app, remove mods from the Mods Library, or use Clear All Mods in Settings. To play without mods temporarily, choose Launch without mods. By hand, delete the .vpk files from the addons folder.",
    },
    {
      question: "Can I install Deadlock mods on Linux or Steam Deck?",
      answer:
        "Yes. Deadlock Mod Manager runs on Linux, including Steam Deck in Desktop Mode, and is available from our APT repository, as a .deb, RPM or Flatpak, on the AUR and in nixpkgs.",
    },
  ],
};

export const Route = createFileRoute("/how-to-install-deadlock-mods")({
  component: InstallGuidePage,
  head: () => guideHead(page),
});

function InstallGuidePage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Guide'
        title='How to install Deadlock mods'
        intro='Two ways to mod Deadlock: let Deadlock Mod Manager handle it in a couple of clicks, or set up the addons folder by hand. Both work; the app also keeps your mods updated and easy to undo.'
      />

      <GuideSection
        id='with-the-app'
        title='Install mods with Deadlock Mod Manager'
        intro='The fastest way, and the one we recommend. Takes about two minutes the first time.'>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
          <StepList
            steps={[
              {
                title: "Download the app",
                body: (
                  <>
                    Get it from the <Link to='/download'>download page</Link>.
                    Windows builds come with a signed installer; Linux has an
                    APT repository plus .deb, RPM, Flatpak, AUR and nixpkgs
                    packages.
                  </>
                ),
              },
              {
                title: "Let it find Deadlock",
                body: "The app detects your Steam install. If you keep Deadlock in another library, set the folder in Settings.",
              },
              {
                title: "Pick mods",
                body: "Open the Mods Store, search or filter by hero and category, and click Download.",
              },
              {
                title: "Launch modded",
                body: "Hit Launch modded. The app enables your mods and sets up gameinfo.gi before the game starts.",
              },
            ]}
          />
          <GuideFigure
            src='/home/app/slide-launch.webp'
            width={880}
            height={704}
            alt='The Launch modded button in Deadlock Mod Manager with installed mods listed'
            caption='One button applies your mods and starts Deadlock.'
          />
        </div>
      </GuideSection>

      <GuideSection
        id='manually'
        title='Install mods manually'
        intro="If you'd rather not use a mod manager, this is what it does for you.">
        <div className={proseClassName}>
          <ol>
            <li>
              Download a mod from GameBanana and extract the archive. You need
              the <code>.vpk</code> file inside, usually named like{" "}
              <code>pak01_dir.vpk</code>.
            </li>
            <li>
              Open your Deadlock folder and go to <code>game/citadel</code>.
              Create an <code>addons</code> folder there if it doesn't exist.
            </li>
            <li>
              Copy the <code>.vpk</code> into <code>game/citadel/addons</code>.
              Each mod needs its own number, so rename files that clash:{" "}
              <code>pak01_dir.vpk</code>, <code>pak02_dir.vpk</code>, and so on.
              When two mods change the same file, the number decides which one
              loads.
            </li>
            <li>
              Open <code>game/citadel/gameinfo.gi</code> in a text editor. In
              the <code>SearchPaths</code> block, add these two lines right
              above <code>Write citadel</code>:
              <pre className='mt-3 overflow-x-auto rounded-lg border border-border bg-surface p-4 text-[13px] text-foreground'>
                {"Game    citadel/addons\nMod     citadel"}
              </pre>
            </li>
            <li>
              Save the file and start Deadlock. Steam's "Verify integrity of
              game files" and some game updates reset <code>gameinfo.gi</code>,
              so you'll need to add the lines again after those.
            </li>
          </ol>
          <p>
            That last step is the usual reason mods "stop working" after a
            patch. The app re-applies it every time you launch modded, and can
            remove it when you quit so launching from Steam stays vanilla.
          </p>
        </div>
      </GuideSection>

      <GuideSection title='After installing'>
        <div className={proseClassName}>
          <ul>
            <li>
              <strong>Conflicts:</strong> two mods that change the same files
              can't both win. The app warns you and lets you change the load
              order.
            </li>
            <li>
              <strong>Updates:</strong> check for mod updates from the Mods
              Library after a Deadlock patch.
            </li>
            <li>
              <strong>Profiles:</strong> keep separate setups (say, a skins-only
              profile) and share them with friends using a Profile ID.
            </li>
            <li>
              More detail lives in the{" "}
              <a
                href={`${DOCS_URL}/using-mod-manager/getting-started`}
                target='_blank'
                rel='noopener noreferrer'>
                getting started docs
              </a>
              .
            </li>
          </ul>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/how-to-install-deadlock-mods' />
      <GuideDownloadBand
        title='Skip the manual steps'
        body='Deadlock Mod Manager does all of this for you, and undoes it just as easily. Free and open source.'
      />
    </div>
  );
}
