import {
  DISCORD_URL,
  GITHUB_REPO,
  REDDIT_URL,
  SITE_URL,
  X_URL,
} from "@/lib/constants";
import { getReleaseUrl } from "@/lib/release-downloads";
import {
  DEFAULT_LOCALE,
  getLocaleConfig,
  type Locale,
} from "@/lib/i18n/locales";
import { absoluteUrl, localizedUrl, SITE_NAME, seo } from "@/utils/seo";

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * Translated answers mark links and code with <Trans> tags such as
 * <link>GitHub</link>. JSON-LD gets the plain text.
 */
const stripTags = (text: string) => text.replace(/<\/?[\w-]+>/g, "");

const faqPage = (faqs: FaqEntry[]) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: stripTags(question),
    acceptedAnswer: { "@type": "Answer", text: stripTags(answer) },
  })),
});

interface HomeStructuredDataOptions {
  /** Latest stable release, e.g. "1.1.0". Omitted when the API is down. */
  version?: string;
  locale?: Locale;
  /** Translated site description. */
  description: string;
  /** The home page FAQ, exactly as rendered. */
  faqs: FaqEntry[];
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

const homeGraph = ({
  version,
  locale = DEFAULT_LOCALE,
  description,
  faqs,
}: HomeStructuredDataOptions) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo512.png`,
        width: 512,
        height: 512,
      },
      sameAs: [GITHUB_REPO, DISCORD_URL, X_URL, REDDIT_URL],
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description,
      inLanguage: getLocaleConfig(locale).hreflang,
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "SoftwareApplication",
      "@id": SOFTWARE_ID,
      name: SITE_NAME,
      alternateName: ["DMM", "deadlockmods.app"],
      description,
      url: localizedUrl("/", locale),
      applicationCategory: "GameApplication",
      operatingSystem: "Windows, Linux",
      downloadUrl: localizedUrl("/download", locale),
      ...(version && {
        softwareVersion: version,
        releaseNotes: getReleaseUrl(version),
      }),
      license: "https://www.gnu.org/licenses/gpl-3.0.html",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      screenshot: `${SITE_URL}/home/app/dashboard-2x.webp`,
      softwareRequirements: "Valve's Deadlock",
      author: {
        "@type": "Person",
        name: "Stormix",
        url: "https://github.com/Stormix",
      },
      publisher: { "@id": ORGANIZATION_ID },
      sameAs: [GITHUB_REPO, DISCORD_URL],
    },
    faqPage(faqs),
  ],
});

export interface GuidePageData {
  path: string;
  title: string;
  description: string;
  /** Breadcrumb label for this page. */
  name: string;
  faqs: FaqEntry[];
}

/**
 * JSON-LD for a landing or guide page: the page itself, its breadcrumb trail
 * and the FAQ it renders. The FAQ text must match the page.
 */
const guideGraph = (
  { path, title, description, name, faqs }: GuidePageData,
  locale: Locale,
) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${localizedUrl(path, locale)}#webpage`,
      url: localizedUrl(path, locale),
      name: title,
      description,
      inLanguage: getLocaleConfig(locale).hreflang,
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": SOFTWARE_ID },
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_NAME,
          item: localizedUrl("/", locale),
        },
        {
          "@type": "ListItem",
          position: 2,
          name,
          item: localizedUrl(path, locale),
        },
      ],
    },
    ...(faqs.length > 0 ? [faqPage(faqs)] : []),
  ],
});

type JsonLdGraph = ReturnType<typeof homeGraph> | ReturnType<typeof guideGraph>;

/** `<` is escaped so answer HTML can never close the script tag early. */
const serialize = (graph: JsonLdGraph) =>
  JSON.stringify(graph).replace(/</g, "\\u003c");

/** Serialized JSON-LD for the home page head. */
export const homeStructuredData = (options: HomeStructuredDataOptions) =>
  serialize(homeGraph(options));

/** Head tags for a landing or guide page: meta, canonical link and JSON-LD. */
export const guideHead = (
  page: GuidePageData,
  locale: Locale = DEFAULT_LOCALE,
) => ({
  ...seo({
    title: page.title,
    description: page.description,
    path: page.path,
    locale,
  }),
  scripts: [
    {
      type: "application/ld+json",
      children: serialize(guideGraph(page, locale)),
    },
  ],
});
