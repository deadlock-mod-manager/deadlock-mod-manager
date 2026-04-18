import { GlobeIcon, HouseIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// Region id -> ISO 3166-1 alpha-2 for `flag-icons`; multi-country regions pick an anchor.
const REGION_TO_ISO: Record<string, string> = {
  eu: "eu",
  "eu-west": "eu",
  "eu-east": "eu",
  "eu-central": "eu",
  "eu-north": "eu",
  "eu-south": "eu",
  euw: "eu",
  eue: "eu",

  na: "us",
  "na-east": "us",
  "na-west": "us",
  nae: "us",
  naw: "us",
  "us-east": "us",
  "us-west": "us",
  use: "us",
  usw: "us",
  ca: "ca",
  "ca-central": "ca",
  mx: "mx",

  sa: "br",
  "sa-east": "br",
  br: "br",
  ar: "ar",
  cl: "cl",

  ap: "sg",
  "ap-southeast": "sg",
  "ap-northeast": "jp",
  "ap-south": "in",
  apac: "sg",
  asia: "sg",
  jp: "jp",
  kr: "kr",
  cn: "cn",
  hk: "hk",
  tw: "tw",
  sg: "sg",
  in: "in",
  th: "th",
  vn: "vn",
  id: "id",
  ph: "ph",

  oce: "au",
  oc: "au",
  au: "au",
  nz: "nz",

  me: "ae",
  "me-central": "ae",
  af: "za",
  za: "za",
  ae: "ae",

  us: "us",
  de: "de",
  fr: "fr",
  gb: "gb",
  uk: "gb",
  nl: "nl",
  pl: "pl",
  it: "it",
  es: "es",
  pt: "pt",
  se: "se",
  no: "no",
  fi: "fi",
  dk: "dk",
  ru: "ru",
  ua: "ua",
  tr: "tr",
  ch: "ch",
  at: "at",
  be: "be",
  ie: "ie",
};

const normalize = (region?: string): string =>
  (region ?? "").trim().toLowerCase().replace(/_/g, "-");

export const isLocalRegion = (region?: string): boolean => {
  const key = normalize(region);
  return key === "local" || key === "dev" || key === "test";
};

export const regionIso = (region?: string): string | null => {
  const key = normalize(region);
  if (!key) return null;
  if (REGION_TO_ISO[key]) return REGION_TO_ISO[key];

  const head = key.split("-")[0];
  if (head && REGION_TO_ISO[head]) return REGION_TO_ISO[head];
  const tail = key.split("-").pop();
  if (tail && REGION_TO_ISO[tail]) return REGION_TO_ISO[tail];

  return null;
};

export const regionLabel = (region?: string): string => {
  const value = (region ?? "").trim();
  if (!value) return "Unknown";
  return value.toUpperCase();
};

interface FlagGlyphProps {
  region?: string;
  className?: string;
}

export const FlagGlyph = ({ region, className }: FlagGlyphProps) => {
  if (isLocalRegion(region)) {
    return (
      <HouseIcon
        aria-hidden
        className={cn("size-3.5 text-muted-foreground", className)}
        weight='fill'
      />
    );
  }

  const iso = regionIso(region);
  if (!iso) {
    return (
      <GlobeIcon
        aria-hidden
        className={cn("size-3.5 text-muted-foreground", className)}
        weight='regular'
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        `fi fi-${iso} fis`,
        "inline-block size-4 shrink-0 rounded-full bg-cover bg-center shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_2px_rgb(0_0_0/0.4)]",
        className,
      )}
    />
  );
};

interface RegionFlagProps {
  region?: string;
  label?: boolean;
  className?: string;
  flagClassName?: string;
}

const RegionFlag = ({
  region,
  label = true,
  className,
  flagClassName,
}: RegionFlagProps) => {
  const text = regionLabel(region);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide",
        className,
      )}
      title={text}>
      <FlagGlyph className={flagClassName} region={region} />
      {label ? <span>{text}</span> : null}
    </span>
  );
};

export default RegionFlag;
