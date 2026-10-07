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
  path: "/deadlock-mod-manager-failed-to-download",
  name: "Failed to download",
  title: "Deadlock Mod Manager Failed to Download or Slow? Fixes",
  description:
    "Mods stuck on Failed to download or downloading slowly in Deadlock Mod Manager? Run the built-in connection check, wait out GameBanana rate limits, and fix antivirus, VPN and DNS problems.",
  faqs: [
    {
      question: "Why does Deadlock Mod Manager say Failed to download?",
      answer:
        "Mods are downloaded straight from GameBanana. The download fails when GameBanana is down or rate-limiting you, when antivirus, a firewall or a VPN blocks the connection, or when the file can't be written to disk.",
    },
    {
      question: "Why are mod downloads so slow?",
      answer:
        "Download speed depends on GameBanana's file servers and the route between you and them. Large mods and busy hours after a Deadlock patch are slower. Turning off a VPN or proxy often helps; the app itself doesn't limit speed.",
    },
    {
      question: "What does GameBanana rate limit reached mean?",
      answer:
        "You sent too many requests in a short time, usually by downloading many mods at once. Wait for the number of seconds shown in the message, then retry.",
    },
    {
      question: "Is Deadlock Mod Manager down?",
      answer:
        "Check the status page at deadlockmods.app/status. If our services are up, use Diagnose connection in the app's Settings to see whether GameBanana or your network is the problem.",
    },
  ],
};

const MESSAGES = [
  {
    message: "GameBanana rate limit reached / Too many requests (HTTP 429)",
    fix: "Wait for the retry time shown, then try again. Download mods a few at a time rather than queueing dozens at once.",
  },
  {
    message: "GameBanana is unavailable / Server error (HTTP 5xx)",
    fix: "GameBanana is down or overloaded. This often happens right after a Deadlock patch. Try again later; nothing on your side needs fixing.",
  },
  {
    message: "GameBanana refused automatic requests / Access denied (HTTP 403)",
    fix: "GameBanana's protection is blocking your connection. Turn off any VPN or proxy and retry. If it persists, open the mod on GameBanana in your browser to check it loads.",
  },
  {
    message: "Network error / can't be resolved",
    fix: "Your connection or DNS is failing. Run Diagnose connection, then try switching DNS to 1.1.1.1 or 8.8.8.8 and flushing it with ipconfig /flushdns.",
  },
  {
    message: "Download failed: … (os error 5) / File write failed",
    fix: "The file downloaded but couldn't be saved. Antivirus or folder permissions are blocking the app.",
    link: "/deadlock-mod-manager-os-error-5",
  },
] as const;

export const Route = createFileRoute(
  "/deadlock-mod-manager-failed-to-download",
)({
  component: FailedToDownloadPage,
  head: () => guideHead(page),
});

function FailedToDownloadPage() {
  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow='Error fix'
        title='Mods failing to download, or downloading slowly'
        intro="Deadlock Mod Manager downloads mods straight from GameBanana. When a download fails, it's GameBanana, your network, or something on your PC blocking the file. The app can tell you which.">
        <ErrorMessage source='Deadlock Mod Manager, on a mod card or in Downloads'>
          Failed to download
        </ErrorMessage>
      </GuideHero>

      <GuideSection
        title='Start with the built-in check'
        intro='Open Settings and click Diagnose connection. It tests your internet, DNS, our API and GameBanana one by one, and each failed check comes with a "How to fix" hint.'>
        <div className={proseClassName}>
          <ul>
            <li>
              <strong>GameBanana fails, everything else passes:</strong> the
              problem is on GameBanana's side or between you and it. Wait, or
              turn off your VPN.
            </li>
            <li>
              <strong>Everything fails:</strong> your connection, firewall or
              DNS is blocking the app. Allow Deadlock Mod Manager through your
              firewall and antivirus.
            </li>
            <li>
              <strong>Everything passes but downloads still fail:</strong> the
              file can't be saved. Check free disk space and the error message
              below.
            </li>
          </ul>
        </div>
      </GuideSection>

      <GuideSection title='Common messages and fixes'>
        <ul className='grid gap-4 md:grid-cols-2'>
          {MESSAGES.map((item) => (
            <li
              key={item.message}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {item.message}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                {item.fix}
              </p>
              {"link" in item && (
                <Link
                  to={item.link}
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  Fix os error 5
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title='Download stuck or very slow?'>
        <div className={proseClassName}>
          <ol>
            <li>
              Cancel the download, remove the mod with its trash icon and add it
              again.
            </li>
            <li>
              Turn off VPNs, proxies and "download accelerator" tools while
              downloading.
            </li>
            <li>
              Try again outside the rush right after a Deadlock patch, when
              GameBanana is busiest.
            </li>
            <li>
              Check <Link to='/status'>our status page</Link>. If everything is
              up and it still fails, share your Diagnose connection results on{" "}
              <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer'>
                Discord
              </a>
              . The Copy results button puts them on your clipboard.
            </li>
          </ol>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-mod-manager-failed-to-download'
        guides={TROUBLESHOOTING_GUIDES}
      />
      <GuideDownloadBand
        title='Every GameBanana mod, one click away'
        body='Browse, download and enable Deadlock mods without leaving the app.'
      />
    </div>
  );
}
