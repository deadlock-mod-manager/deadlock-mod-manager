import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  DesktopIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PlatformButtonText,
  PlatformIcon,
  usePlatformDownload,
} from "@/components/downloads/platform-download-button";
import { APP_NAME, DOWNLOAD_PAGE_URL } from "@/lib/constants";

type CtaSize = "sm" | "lg";

/**
 * Filled gold button. "lg" is the page's primary action; "sm" is the
 * navbar's, kept noticeably smaller so it stays secondary to the hero.
 */
export const primaryCta = (size: CtaSize) =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
    size === "lg"
      ? "h-11 pr-4.5 pl-3.5 text-[15px]"
      : "h-8 pr-3 pl-2.5 text-[13px]",
  );

/**
 * The note under the primary action floats below it on wide screens. On phones
 * the action takes its own row and the note sits in flow with its line
 * reserved, so a wrapped sibling link never ends up underneath it and filling
 * it after hydration doesn't shift the page.
 */
const ctaWrapperClassName =
  "relative inline-flex max-sm:w-full max-sm:flex-col max-sm:items-start";
const noteClassName =
  "absolute top-full left-0 mt-3 w-max max-w-[calc(100vw-3rem)] text-[13px] text-muted-foreground max-sm:static max-sm:min-h-5";

const NoteCheck = () => (
  <CheckCircleIcon
    aria-hidden='true'
    weight='fill'
    className='size-4 shrink-0 text-online'
  />
);

/**
 * The page's one primary action: download the right build for this OS. When a
 * direct download starts, a note confirms it and names the next step. Phones,
 * tablets and Macs can't run the app, so they get SendToPcCta instead.
 */
export const DownloadCta = () => {
  const { t } = useTranslation("common");
  const { os, mobile, canInstall, linkProps } = usePlatformDownload();
  const [started, setStarted] = useState(false);

  if (!canInstall) return <SendToPcCta preferShare={mobile !== null} />;

  return (
    <span className={ctaWrapperClassName}>
      <a
        {...linkProps}
        onClick={() => {
          linkProps.onClick();
          if (linkProps.download) setStarted(true);
        }}
        className={primaryCta("lg")}>
        <PlatformIcon os={os} />
        <PlatformButtonText os={os} />
      </a>
      <span role='status' className={noteClassName}>
        {started && (
          <span className='inline-flex animate-dl-rise items-center gap-1.5'>
            <NoteCheck />
            {t("cta.downloadStarted")}
          </span>
        )}
      </span>
    </span>
  );
};

type SendResult = "copied" | "shared" | "failed";

/**
 * Hands the downloads page link to the visitor's PC: the share sheet when
 * there is one (phones), otherwise the clipboard. Returns null when the
 * visitor dismisses the share sheet.
 */
const sendLinkToPc = async (
  preferShare: boolean,
): Promise<SendResult | null> => {
  if (preferShare && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: APP_NAME, url: DOWNLOAD_PAGE_URL });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(DOWNLOAD_PAGE_URL);
    return "copied";
  } catch {
    return "failed";
  }
};

/** Primary action for devices that can't install the app. */
const SendToPcCta = ({ preferShare }: { preferShare: boolean }) => {
  const { t } = useTranslation("common");
  const [result, setResult] = useState<SendResult | null>(null);

  return (
    <span className={ctaWrapperClassName}>
      <button
        type='button'
        onClick={async () => {
          const next = await sendLinkToPc(preferShare);
          if (next) setResult(next);
        }}
        className={primaryCta("lg")}>
        <DesktopIcon aria-hidden='true' weight='bold' />
        {t("cta.sendToPc")}
      </button>
      <span role='status' className={noteClassName}>
        {result ? (
          <span
            key={result}
            className='inline-flex animate-dl-rise items-center gap-1.5'>
            {result !== "failed" && <NoteCheck />}
            {t(`cta.sendNotes.${result}`, {
              url: DOWNLOAD_PAGE_URL.replace("https://", ""),
            })}
          </span>
        ) : (
          t("platformDownload.available")
        )}
      </span>
    </span>
  );
};

/** Secondary actions are text links with a trailing arrow, never boxes. */
export const secondaryCta = (size: CtaSize) =>
  cn(
    "group/cta inline-flex shrink-0 items-center gap-2 rounded-md font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4",
    size === "lg" ? "h-11 text-[15px]" : "h-9 text-sm",
  );

export const CtaArrow = () => (
  <ArrowRightIcon
    aria-hidden='true'
    weight='bold'
    className='size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cta:translate-x-1'
  />
);
