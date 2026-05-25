import i18n from "@/lib/i18n";

const WHITESPACE_REGEX = /\s+/;

const I18N_KEY_COMMENT_PREFIX = "// settings.autoexecCommands.";
const I18N_DESCRIPTION_SUFFIX = ".description";
const CONDEBUG_COMMAND = "condebug";

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

const parseGeneratedCommentCommandId = (line: string): string | null => {
  const trimmedLine = line.trim();

  if (
    !trimmedLine.startsWith(I18N_KEY_COMMENT_PREFIX) ||
    !trimmedLine.endsWith(I18N_DESCRIPTION_SUFFIX)
  ) {
    return null;
  }

  const commandId = trimmedLine
    .slice(I18N_KEY_COMMENT_PREFIX.length)
    .slice(0, -I18N_DESCRIPTION_SUFFIX.length);

  return commandId.length > 0 ? commandId : null;
};

const isGeneratedCommandComment = (
  line: string,
  commandId: string,
): boolean => {
  const trimmedLine = line.trim();

  return (
    trimmedLine ===
      `${I18N_KEY_COMMENT_PREFIX}${commandId}${I18N_DESCRIPTION_SUFFIX}` ||
    trimmedLine === `// ${getAutoexecCommandFileComment(commandId)}`
  );
};

export const repairI18nKeyCommentsInContent = (content: string): string => {
  return content
    .split("\n")
    .map((line) => {
      const commandId = parseGeneratedCommentCommandId(line);

      if (!commandId) {
        return line;
      }

      const englishComment = getAutoexecCommandFileComment(commandId);
      if (englishComment.startsWith("settings.autoexecCommands.")) {
        return line;
      }

      const indentation = line.slice(0, line.length - line.trimStart().length);
      return `${indentation}// ${englishComment}`;
    })
    .join("\n");
};

const removePreviousGeneratedComment = (
  lines: string[],
  commandId: string,
): void => {
  const previousLine = lines.at(-1);
  if (previousLine && isGeneratedCommandComment(previousLine, commandId)) {
    lines.pop();
  }
};

export const removeCondebugFromContent = (content: string): string => {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const commandKey = parseCommandLine(line);
    if (commandKey === CONDEBUG_COMMAND) {
      removePreviousGeneratedComment(result, CONDEBUG_COMMAND);
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

export const hasAutoexecLaunchableContent = (content: string): boolean => {
  return content.trim().length > 0;
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
