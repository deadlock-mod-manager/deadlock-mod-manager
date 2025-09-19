import { db, schema } from "./client";

(async () => {
  try {
    await db
      .insert(schema.customSettings)
      .values({
        key: "+citadel_unit_status_use_new",
        value: "true",
        type: "launch_option", // TODO: enum
        description: "Use new unit status system (new healthbar, etc.)",
      })
      .onConflictDoNothing();
  } catch (_error) {
    process.exit(1);
  }
})();
