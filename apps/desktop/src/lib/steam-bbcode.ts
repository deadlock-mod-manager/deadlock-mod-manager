/**
 * Steam announcements are written in Steam's BBCode dialect. This turns them
 * into plain HTML for `interweave`, which sanitises the result again before it
 * reaches the DOM.
 */

const CLAN_IMAGE_BASE = "https://clan.akamai.steamstatic.com/images";

const SIMPLE_TAGS: Record<string, string> = {
  b: "strong",
  i: "em",
  u: "u",
  s: "s",
  strike: "s",
  h1: "h3",
  h2: "h4",
  h3: "h5",
  p: "p",
  quote: "blockquote",
  code: "code",
  list: "ul",
  olist: "ol",
};

const SIMPLE_TAG = new RegExp(
  `\\[(/?)(${Object.keys(SIMPLE_TAGS).join("|")})\\]`,
  "gi",
);

const BLOCK_TAG = "(?:ul|ol|li|p|h3|h4|h5|blockquote|hr)";
const BREAKS_BEFORE_BLOCK = new RegExp(
  `(?:<br>\\s*)+(<\\/?${BLOCK_TAG}\\b)`,
  "g",
);
const BREAKS_AFTER_BLOCK = new RegExp(`(<\\/?${BLOCK_TAG}>)(?:\\s*<br>)+`, "g");

// Placeholders for Steam's escaped brackets (`\[ General ]`), so the tag
// passes below leave them alone.
const OPEN_BRACKET = "\u0001";
const CLOSE_BRACKET = "\u0002";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveImageTokens = (value: string): string =>
  value
    .replaceAll("{STEAM_CLAN_LOC_IMAGE}", CLAN_IMAGE_BASE)
    .replaceAll("{STEAM_CLAN_IMAGE}", CLAN_IMAGE_BASE);

export const steamBbcodeToHtml = (input: string): string => {
  let html = escapeHtml(resolveImageTokens(input))
    .replace(/\\\[/g, OPEN_BRACKET)
    .replace(/\\\]/g, CLOSE_BRACKET);

  html = html.replace(
    SIMPLE_TAG,
    (_, close: string, tag: string) =>
      `<${close}${SIMPLE_TAGS[tag.toLowerCase()]}>`,
  );

  html = html
    .replace(/\[\*\]/g, "<li>")
    .replace(/\[\/\*\]/g, "</li>")
    .replace(/\[hr\](?:\[\/hr\])?/gi, "<hr>")
    .replace(/\[img\](.*?)\[\/img\]/gi, (_, src: string) =>
      isHttpUrl(src) ? `<img src="${src}" alt="" loading="lazy">` : "",
    )
    .replace(/\[url\](.*?)\[\/url\]/gi, (_, href: string) =>
      isHttpUrl(href) ? `<a href="${href}">${href}</a>` : href,
    )
    .replace(/\[url=(?:&quot;)?(.*?)(?:&quot;)?\]/gi, (_, href: string) =>
      isHttpUrl(href) ? `<a href="${href}">` : "<a>",
    )
    .replace(/\[\/url\]/gi, "</a>")
    .replace(
      /\[previewyoutube=([\w-]+)[^\]]*\](?:\[\/previewyoutube\])?/gi,
      (_, id: string) =>
        `<p><a href="https://www.youtube.com/watch?v=${id}">YouTube</a></p>`,
    )
    // Anything we don't understand (tables, spoilers, video) is dropped,
    // keeping its inner text.
    .replace(/\[\/?[\w-]+(?:=[^\]]*)?\]/gi, "")
    .replaceAll(OPEN_BRACKET, "[")
    .replaceAll(CLOSE_BRACKET, "]")
    .replace(/\r?\n/g, "<br>")
    .replace(BREAKS_BEFORE_BLOCK, "$1")
    .replace(BREAKS_AFTER_BLOCK, "$1")
    .replace(/<p>\s*<\/p>/g, "");

  return html.trim();
};

/** First `[img]` in a post, used as its cover. */
export const steamBbcodeFirstImage = (input: string): string | null => {
  const match = /\[img\](.*?)\[\/img\]/i.exec(resolveImageTokens(input));
  return match && isHttpUrl(match[1]) ? match[1] : null;
};

/** Plain-text preview of a post, without images or markup. */
export const steamBbcodeExcerpt = (input: string, maxLength = 180): string => {
  const text = input
    .replace(/\[img\].*?\[\/img\]/gi, "")
    .replace(/\[previewyoutube=[^\]]*\](?:\[\/previewyoutube\])?/gi, "")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
};
