import i18n from "@/lib/i18n";

const WHITESPACE_REGEX = /\s+/;

const I18N_KEY_COMMENT_PREFIX = "// settings.autoexecCommands.";

const parseCommandLine = (line: string): string | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("//")) {
    return null;
  }

  const [commandKey] = trimmed.split(WHITESPACE_REGEX);
  if (!commandKey) {
    return null;
  }

  return commandKey;
};

export const getAutoexecCommandFileComment = (commandId: string): string => {
  return i18n.t(`settings.autoexecCommands.${commandId}.description`, {
    lng: "en",
  });
};

export const repairI18nKeyCommentsInContent = (content: string): string => {
  let repairedContent = content;

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (
      !trimmedLine.startsWith(I18N_KEY_COMMENT_PREFIX) ||
      !trimmedLine.endsWith(".description")
    ) {
      continue;
    }

    const commandId = trimmedLine
      .slice(I18N_KEY_COMMENT_PREFIX.length)
      .replace(/\.description$/, "");

    if (commandId.length === 0) {
      continue;
    }

    const englishComment = getAutoexecCommandFileComment(commandId);
    if (englishComment.startsWith("settings.autoexecCommands.")) {
      continue;
    }

    repairedContent = repairedContent.replace(
      trimmedLine,
      `// ${englishComment}`,
    );
  }

  return repairedContent;
};

export const removeCondebugFromContent = (content: string): string => {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const commandKey = parseCommandLine(line);
    if (commandKey === "condebug") {
      const previousLine = result.at(-1)?.trim() ?? "";
      if (previousLine.startsWith("//")) {
        result.pop();
      }
      continue;
    }

    result.push(line);
  }

  return result.join("\n").trimEnd();
};

export const parseAutoexecCommandKeys = (content: string): Set<string> => {
  const keys = new Set<string>();

  for (const line of content.split("\n")) {
    const commandKey = parseCommandLine(line);
    if (commandKey) {
      keys.add(commandKey);
    }
  }

  return keys;
};

export const commandExistsInContent = (
  content: string,
  commandKey: string,
): boolean => {
  return parseAutoexecCommandKeys(content).has(commandKey);
};

export const appendPredefinedCommand = (
  content: string,
  command: string,
  value: string,
  description: string,
): string => {
  const commandLine = value.length > 0 ? `${command} ${value}` : command;
  const block = `\n// ${description}\n${commandLine}\n`;
  const trimmedContent = content.trimEnd();

  if (trimmedContent.length === 0) {
    return `${block.trimStart()}\n`;
  }

  return `${trimmedContent}${block}`;
};

export const formatCommandPreview = (
  command: string,
  value: string,
): string => {
  if (value.length === 0) {
    return command;
  }

  return `${command} ${value}`;
};

export const normalizeAutoexecContent = (content: string): string => {
  return removeCondebugFromContent(repairI18nKeyCommentsInContent(content));
};
