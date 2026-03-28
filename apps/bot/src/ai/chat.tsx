import { createDiscordAdapter } from "@chat-adapter/discord";
import { createIoRedisState } from "@chat-adapter/state-ioredis";
import type { Agent } from "@deadlock-mods/ai";
import {
  Chat,
  toAiMessages,
  Card,
  CardText,
  Actions,
  Button,
  Divider,
} from "chat";
import type { Thread } from "chat";
import { discordConfig } from "@/discord/config";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

const GATEWAY_LISTENER_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 20;

interface SupportThreadState {
  escalated?: boolean;
}

export interface SupportChat {
  chatBot: Chat<
    { discord: ReturnType<typeof createDiscordAdapter> },
    SupportThreadState
  >;
  startSupportChatGateway: (options: { abortSignal: AbortSignal }) => void;
}

interface SearchToolResult {
  results: Array<{ score: number }>;
}

function isSearchToolResult(value: unknown): value is SearchToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results)
  );
}

interface StepToolResult {
  toolName: string;
  result: unknown;
}

export function createSupportChat(agent: Agent): SupportChat {
  const adapters = {
    discord: createDiscordAdapter({
      logger: logger.child().withContext({ service: "chat" }),
      botToken: env.BOT_TOKEN,
      applicationId: env.DISCORD_APPLICATION_ID,
      publicKey: env.DISCORD_PUBLIC_KEY,
    }),
  };

  const chatBot = new Chat<typeof adapters, SupportThreadState>({
    userName: "Deadlock Mod Manager",
    logger: "silent",
    concurrency: "queue",
    fallbackStreamingPlaceholderText: null,
    adapters,
    state: createIoRedisState({
      client: redis,
      logger: logger.child().withContext({ service: "chat-state" }),
    }),
  });

  async function streamAgentResponse(
    thread: Thread<SupportThreadState>,
  ): Promise<void> {
    await thread.startTyping();

    const fetched = await thread.adapter.fetchMessages(thread.id, {
      limit: HISTORY_LIMIT,
    });
    const history = await toAiMessages(fetched.messages, {
      includeNames: true,
    });

    const collectedToolResults: StepToolResult[] = [];

    const result = await agent.stream(history, {
      memory: {
        thread: thread.id,
        resource: `discord-support-${thread.id}`,
      },
      onStepFinish: (step: string | object) => {
        const parsed = typeof step === "string" ? JSON.parse(step) : step;
        if (parsed?.toolCalls && Array.isArray(parsed.toolCalls)) {
          for (const call of parsed.toolCalls) {
            if (
              typeof call === "object" &&
              call !== null &&
              "toolName" in call
            ) {
              collectedToolResults.push({
                toolName: String(call.toolName),
                result: "result" in call ? call.result : undefined,
              });
            }
          }
        }
        if (parsed?.toolResults && Array.isArray(parsed.toolResults)) {
          for (const tr of parsed.toolResults) {
            if (typeof tr === "object" && tr !== null && "toolName" in tr) {
              collectedToolResults.push({
                toolName: String(tr.toolName),
                result: "result" in tr ? tr.result : undefined,
              });
            }
          }
        }
      },
    });

    await thread.post(result.textStream);

    const shouldAutoEscalate = checkAutoEscalation(collectedToolResults);
    const state = await thread.state;

    if (shouldAutoEscalate && !state?.escalated) {
      await thread.setState({ escalated: true });
      await thread.post(
        `I wasn't able to find a confident answer for this. Tagging <@&${discordConfig.coreMaintainerRoles[0]}> for help.`,
      );
    } else if (!state?.escalated) {
      await thread.post(
        <Card title='Need more help?'>
          <CardText>
            If this didn't resolve your issue, escalate to our core team.
          </CardText>
          <Divider />
          <Actions>
            <Button id='escalate' style='danger'>
              Escalate to Core Team
            </Button>
          </Actions>
        </Card>,
      );
    }
  }

  function checkAutoEscalation(toolResults: StepToolResult[]): boolean {
    const searchToolNames = new Set(["searchDocsTool", "searchKbTool"]);
    const searchResults = toolResults.filter((tr) =>
      searchToolNames.has(tr.toolName),
    );

    if (searchResults.length === 0) return false;

    return searchResults.every((tr) => {
      if (!isSearchToolResult(tr.result)) return true;
      const entries = tr.result.results;
      return (
        entries.length === 0 ||
        entries.every(
          (entry) => entry.score < discordConfig.escalationConfidenceThreshold,
        )
      );
    });
  }

  chatBot.onNewMention(async (thread) => {
    await thread.subscribe();
    await streamAgentResponse(thread);
  });

  chatBot.onSubscribedMessage(async (thread) => {
    await streamAgentResponse(thread);
  });

  chatBot.onNewMessage(/.*/i, async (thread, message) => {
    const threadId = message.threadId ?? "";
    const isBugReportChannel = threadId.includes(
      discordConfig.bugReportChannelId,
    );

    if (!isBugReportChannel) return;

    await thread.subscribe();
    await streamAgentResponse(thread);
  });

  chatBot.onAction("escalate", async (event) => {
    if (!event.thread) return;

    await event.thread.setState({ escalated: true });
    await event.thread.post(
      `${event.user.fullName} requested help from the core team. <@&${discordConfig.coreMaintainerRoles[0]}>, please take a look.`,
    );
  });

  function startSupportChatGateway(options: {
    abortSignal: AbortSignal;
  }): void {
    const adapter = chatBot.getAdapter("discord");

    const waitUntil = (task: Promise<unknown>) => {
      void task
        .catch((err) => {
          logger
            .withError(err instanceof Error ? err : new Error(String(err)))
            .error("Discord Chat gateway listener failed");
        })
        .finally(() => {
          if (!options.abortSignal.aborted) {
            void kick();
          }
        });
    };

    const kick = async () => {
      await adapter.startGatewayListener(
        { waitUntil },
        GATEWAY_LISTENER_MS,
        options.abortSignal,
        undefined,
      );
    };

    void kick();
  }

  return { chatBot, startSupportChatGateway };
}
