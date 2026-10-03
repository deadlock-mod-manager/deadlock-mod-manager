import { describe, expect, it } from "bun:test";
import {
  steamBbcodeExcerpt,
  steamBbcodeFirstImage,
  steamBbcodeToHtml,
} from "./steam-bbcode";

describe("steamBbcodeToHtml", () => {
  it("converts Valve's patch note paragraphs and escaped section headers", () => {
    const html = steamBbcodeToHtml(
      "[p][b]\\[ General ][/b][/p][p][/p][p]- Guardian bounty increased by 10%[/p]",
    );
    expect(html).toBe(
      "<p><strong>[ General ]</strong></p><p>- Guardian bounty increased by 10%</p>",
    );
  });

  it("resolves clan image tokens and wraps linked images", () => {
    const html = steamBbcodeToHtml(
      "[url=https://www.playdeadlock.com/x][img]{STEAM_CLAN_LOC_IMAGE}/1/a.png[/img][/url]",
    );
    expect(html).toBe(
      '<a href="https://www.playdeadlock.com/x"><img src="https://clan.akamai.steamstatic.com/images/1/a.png" alt="" loading="lazy"></a>',
    );
  });

  it("turns lists into list items without stray line breaks", () => {
    expect(steamBbcodeToHtml("[list]\n[*]One\n[*]Two\n[/list]")).toBe(
      "<ul><li>One<li>Two</ul>",
    );
  });

  it("escapes raw HTML and drops non-http links", () => {
    const html = steamBbcodeToHtml(
      "<script>x</script>[url=javascript:alert(1)]bad[/url]",
    );
    expect(html).toBe("&lt;script&gt;x&lt;/script&gt;<a>bad</a>");
  });

  it("keeps the text of tags it does not know", () => {
    expect(steamBbcodeToHtml("[spoiler]secret[/spoiler]")).toBe("secret");
  });
});

describe("steamBbcodeFirstImage", () => {
  it("returns the first resolved image", () => {
    expect(
      steamBbcodeFirstImage("text [img]{STEAM_CLAN_IMAGE}/2/b.jpg[/img]"),
    ).toBe("https://clan.akamai.steamstatic.com/images/2/b.jpg");
  });

  it("returns null without images", () => {
    expect(steamBbcodeFirstImage("[p]hi[/p]")).toBeNull();
  });
});

describe("steamBbcodeExcerpt", () => {
  it("strips markup and images", () => {
    expect(
      steamBbcodeExcerpt("[img]x[/img]\n[p][i]Rat King[/i] is here.[/p]"),
    ).toBe("Rat King is here.");
  });

  it("cuts long text on a word boundary", () => {
    const excerpt = steamBbcodeExcerpt("word ".repeat(60), 30);
    expect(excerpt.endsWith("...")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(33);
  });
});
