export const fixtureGamePaths = (content: string): string[] =>
  [
    ...content.matchAll(
      /^[\t ]*"?Game"?[\t ]+("[^"\r\n]*"|[^"\s]+)[\t ]*(?:\/\/[^\r\n]*)?\r?$/gm,
    ),
  ].map((match) => match[1].replace(/^"|"$/g, ""));
