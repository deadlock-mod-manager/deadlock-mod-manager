import { createOpenAPI } from "fumadocs-openapi/server";

export const openapi = createOpenAPI({
  input: ["https://api.deadlockmods.app/docs/openapi.json"],
});
