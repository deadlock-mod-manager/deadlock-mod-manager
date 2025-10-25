import { HumanMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { CallbackHandler } from "@langfuse/langchain";
import { err, ok } from "neverthrow";
import { createSupportBotPrompt } from "../prompts/support-bot";
import { Agent } from ".";

export class SupportAgent extends Agent {
  async chain() {
    const prompt = await createSupportBotPrompt();

    if (prompt.isErr()) {
      return err(prompt.error);
    }

    return ok(prompt.value.pipe(this.llm).pipe(new StringOutputParser()));
  }
  async invoke(
    message: string,
    sessionId: string,
    userId: string,
    tags: string[],
  ) {
    const chain = await this.chain();
    if (chain.isErr()) {
      return err(chain.error);
    }

    const response = await chain.value.invoke({
      messages: [new HumanMessage(message)],
      callbacks: [
        new CallbackHandler({
          sessionId,
          userId,
          tags,
        }),
      ],
    });

    return ok(response);
  }
}
