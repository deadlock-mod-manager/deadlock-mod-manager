import Parser from "rss-parser";

interface GameBananaItem {
  title: string;
  link: string;
  pubDate: string;
  image?: string;
  guid?: string;
}

interface GameBananaFeed {
  title: string;
  items: GameBananaItem[];
}

class GameBananaRssParser extends Parser<GameBananaFeed, GameBananaItem> {
  constructor() {
    super({
      customFields: {
        item: ["image"],
      },
    });
  }

  async parseURL(url: string) {
    try {
      const response = await fetch(url);
      const content = await response.text();

      if (content.includes("<items>")) {
        const transformedContent = content
          .replace("<items>", "<channel>")
          .replace("</items>", "</channel>");

        return super.parseString(transformedContent);
      }

      return super.parseString(content);
    } catch (error) {
      throw new Error(
        `Failed to parse GameBanana RSS feed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error },
      );
    }
  }
}

export const gamebananaRssParser = new GameBananaRssParser();
