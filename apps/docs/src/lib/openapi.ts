import { createOpenAPI } from "fumadocs-openapi/server";

export const openapi = createOpenAPI({
  // The OpenAPI schema from the Deadlock Mod Manager API
  input: ["https://api.deadlockmods.app/docs/openapi.json"],
});
