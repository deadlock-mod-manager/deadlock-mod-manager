import {
  BUG_REPORT_URL,
  DISCORD_URL,
  DOCS_URL,
  GITHUB_REPO,
  REDDIT_URL,
  SITE_URL,
  X_URL,
} from "@/lib/constants";
import { absoluteUrl, DEFAULT_DESCRIPTION, SITE_NAME, seo } from "@/utils/seo";

/**
 * Plain-text copy of the FAQ in components/home/faq-section.tsx, used for
 * the FAQPage JSON-LD. That component renders JSX answers and does not
 * export its data, so the text is duplicated here. Keep both in sync: the
 * structured data must match what the page shows.
 */
const HOME_FAQS = [
  {
    question: "What is Deadlock Mod Manager?",
    answer:
      "A small desktop app that makes Deadlock modding simple. Browse, install, and manage mods without touching your game folders.",
  },
  {
    question: "How do I install mods?",
    answer:
      "<ol><li>Download and open Deadlock Mod Manager.</li><li>It detects Deadlock for you, or you can set the folder in Settings.</li><li>Browse the Mods Store and click Download.</li><li>The app installs the mod in the right place. No manual steps.</li></ol>",
  },
  {
    question: "Is it safe to use mods?",
    answer:
      "The app just copies .vpk files into your game's addons folder, never patches the Deadlock executable, and backs up first so you can restore in one click or launch vanilla any time. Skins are client-side, and the mods themselves are made by the community, so stick to ones you trust.",
  },
  {
    question: "How do I uninstall mods?",
    answer:
      "Open the Mods Library and remove what you don't want, or use Clear All Mods in Settings.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Windows and Linux. On Linux you can install from our APT repository (Ubuntu/Debian), the AUR (Arch), nixpkgs, or the Flatpak bundle.",
  },
  {
    question: "I found a bug, how do I report it?",
    answer: `Open an issue on our <a href="${BUG_REPORT_URL}">GitHub repository</a>. Include steps to reproduce, what you expected, and what happened.`,
  },
  {
    question: "Where can I find more detailed documentation?",
    answer: `The <a href="${DOCS_URL}">documentation site</a> has guides, tutorials, and technical reference.`,
  },
  {
    question: "Will Deadlock have official skins?",
    answer:
      "Deadlock is evolving. If official cosmetics arrive, this app will still be here for community-made options.",
  },
  {
    question: "Can other players see my installed skins?",
    answer:
      "No. These are client-side. Other players see default models and textures.",
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

const faqPage = (faqs: FaqEntry[]) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
});

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

const homeGraph = () => ({
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
      description: DEFAULT_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "SoftwareApplication",
      "@id": SOFTWARE_ID,
      name: SITE_NAME,
      alternateName: ["DMM", "deadlockmods.app"],
      description: DEFAULT_DESCRIPTION,
      url: absoluteUrl("/"),
      applicationCategory: "GameApplication",
      operatingSystem: "Windows, Linux",
      downloadUrl: absoluteUrl("/download"),
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
    faqPage(HOME_FAQS),
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
const guideGraph = ({
  path,
  title,
  description,
  name,
  faqs,
}: GuidePageData) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl(path)}#webpage`,
      url: absoluteUrl(path),
      name: title,
      description,
      inLanguage: "en",
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
          item: absoluteUrl("/"),
        },
        { "@type": "ListItem", position: 2, name, item: absoluteUrl(path) },
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
export const homeStructuredData = () => serialize(homeGraph());

/** Head tags for a landing or guide page: meta, canonical link and JSON-LD. */
export const guideHead = (page: GuidePageData) => ({
  ...seo({
    title: page.title,
    description: page.description,
    path: page.path,
  }),
  scripts: [
    { type: "application/ld+json", children: serialize(guideGraph(page)) },
  ],
});
