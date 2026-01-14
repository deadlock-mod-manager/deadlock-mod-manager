import { client } from "@/utils/orpc";

export const parseKvContent = async (input: { content: string }) => {
  return client.parseKv({ content: input.content });
};
