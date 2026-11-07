/** Read unconditional Game mounts from the controlled multiline E2E fixtures. */
export const fixtureGamePaths = (content: string): string[] =>
  [
    ...content.matchAll(
      /^[\t ]*"?Game"?[\t ]+("[^"\r\n]*"|[^"\s]+)[\t ]*(?:\/\/[^\r\n]*)?\r?$/gm,
    ),
  ].map((match) => match[1].replace(/^"|"$/g, ""));
