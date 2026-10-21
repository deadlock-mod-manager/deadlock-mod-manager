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

// Common English words that are rare as standalone words in other Latin-script
// languages ("i", "to", "of", "was", "my" are left out because they are not).
const ENGLISH_WORDS = new Set([
  "the",
  "and",
  "you",
  "your",
  "you're",
  "it",
  "it's",
  "that",
  "this",
  "what",
  "with",
  "have",
  "has",
  "need",
  "just",
  "any",
  "mean",
  "don't",
  "dont",
  "can't",
  "cant",
  "i'm",
  "im",
  "i've",
  "i'll",
  "isn't",
  "didn't",
  "doesn't",
  "wanna",
  "gonna",
  "about",
  "but",
  "are",
  "be",
  "been",
  "would",
  "could",
  "should",
  "there",
  "they",
  "know",
  "like",
  "how",
  "why",
  "when",
  "not",
  "get",
  "got",
  "if",
]);

function englishWordShare(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/’/g, "'")
    .match(/[\p{L}']+/gu);
  if (!words) return 0;
  return words.filter((word) => ENGLISH_WORDS.has(word)).length / words.length;
}

export function detectNonEnglishLanguage(
  detector: LanguageIdentifier,
  content: string,
): string | null {
  const text = getLanguageDetectionText(content);
  // Short messages, names, and gaming slang are too ambiguous for enforcement.
  if ((text.match(/\p{L}/gu)?.length ?? 0) < 20) return null;
  // cld3 confidently misreads short casual English (e.g. as Malagasy).
  if (englishWordShare(text) >= 0.3) return null;

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
