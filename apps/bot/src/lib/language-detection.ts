import { type LanguageIdentifier, loadModule } from "cld3-asm";

export async function createLanguageDetector(): Promise<LanguageIdentifier> {
  return (await loadModule()).create(20, 10000);
}

export function getLanguageDetectionText(content: string): string {
  return content
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectNonEnglishLanguage(
  detector: LanguageIdentifier,
  content: string,
): string | null {
  const text = getLanguageDetectionText(content);
  // Short messages, names, and gaming slang are too ambiguous for enforcement.
  if ((text.match(/\p{L}/gu)?.length ?? 0) < 20) return null;

  const result = detector.findLanguage(text);
  if (
    !result.is_reliable ||
    result.probability < 0.9 ||
    result.language === "en" ||
    result.language === "und"
  )
    return null;
  return result.language;
}
