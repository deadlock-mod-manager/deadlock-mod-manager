import type { InferPageType } from "fumadocs-core/source";
import { MOD_REGISTRY_AGENT_PROMPT } from "@/lib/mod-registry-agent-prompt";
import type { source } from "@/lib/source";

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");
  // Processed MDX retains custom components without evaluating their props.
  const markdown = processed.replace(
    /<CopyAgentPrompt\b[^>]*\/>/g,
    () =>
      `## Prompt for a coding agent\n\n\`\`\`text\n${MOD_REGISTRY_AGENT_PROMPT}\n\`\`\``,
  );

  return `# ${page.data.title} (${page.url})

${markdown}`;
}
