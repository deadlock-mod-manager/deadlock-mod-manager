import type { IntentLabel } from "@/nlp/intent-classifier";

const HEURISTIC_RULES: { patterns: RegExp[]; intent: IntentLabel }[] = [
  {
    intent: "error or crash log",
    patterns: [
      /^\s*Error:\s/m,
      /Exception in thread/,
      /Traceback \(most recent call last\)/,
      /UnhandledPromiseRejection/,
      /\bpanic:\s+/i,
      /\bSIG(SEGV|ABRT|ILL)\b/,
      /^\s*at\s+[\w.$]+\s*\(/m,
      /^\s*at\s+[\w.]+\s+\(/m,
      /Caused by:/,
      /\[error\]/i,
    ],
  },
  {
    intent: "help request",
    patterns: [
      /^\s*help\b/i,
      /\bhelp me\b/i,
      /\b(how do i|how to|how can i)\b/i,
      /\b(can someone help|can anyone help|please help|pls help)\b/i,
      /\b(not working|doesn't work|doesnt work|won't start|wont start|can't install|cant install)\b/i,
      /\b(stuck on|stuck at|game crashes|keeps crashing)\b/i,
    ],
  },
  {
    intent: "commission request",
    patterns: [
      /\b(commission|looking for someone to make|paid request|paid mod)\b/i,
      /\b(can someone make|can anyone make|anyone willing to make)\b/i,
      /\b(request(ing)?\s+a\s+mod|want(ed)?\s+a\s+mod)\b/i,
      /\b(hire|hiring)\b.*\b(mod|modder|skin)\b/i,
    ],
  },
  {
    intent: "bug report",
    patterns: [
      /\b(bug report|found a bug|reporting a bug)\b/i,
      /\b(this is (a\s+)?bug|there'?s a bug)\b/i,
    ],
  },
  {
    intent: "feature request",
    patterns: [
      /\b(feature request|would be cool|please add|can you add)\b/i,
      /\b(suggestion|would love to see|would be nice)\b/i,
    ],
  },
  {
    intent: "mod showcase",
    patterns: [
      /\b(check out my mod|i made a mod|just released|new mod)\b/i,
      /\b(mod showcase|showing off)\b/i,
    ],
  },
  {
    intent: "linux support",
    patterns: [
      /\b(arch linux|ubuntu|fedora|debian|proton|wine|lutris|steam deck)\b/i,
      /\b(linux|steamdeck|steam os|steamos)\b/i,
    ],
  },
];

export function getHeuristicIntent(text: string): IntentLabel | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  for (const rule of HEURISTIC_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        return rule.intent;
      }
    }
  }

  return null;
}
