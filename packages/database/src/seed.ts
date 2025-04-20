import { customSettings, db } from "./client";

(async () => {
  try {
    await db.insert(customSettings).values({
      key: "citadel_unit_status_use_new",
      value: "true",
      type: "launch_option", // TODO: enum
      description: "Use new unit status system (new healthbar, etc.)",
    }).onConflictDoNothing();

    console.log("Seed completed successfully");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
