import { db, schema } from "./client";

(async () => {
  try {
    // Seed custom settings
    await db
      .insert(schema.customSettings)
      .values({
        key: "+citadel_unit_status_use_new",
        value: "true",
        type: "launch_option", // TODO: enum
        description: "Use new unit status system (new healthbar, etc.)",
      })
      .onConflictDoNothing();

    // Seed feature flags
    await db
      .insert(schema.featureFlags)
      .values([
        {
          name: "profile-sharing",
          description: "Enable profile sharing functionality",
          value: false, // Disabled by default
        },
        {
          name: "profile-management",
          description:
            "Enable profile management features (create, edit, switch profiles)",
          value: false, // Disabled by default
        },
      ])
      .onConflictDoNothing();

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Failed to seed database:", error);
    process.exit(1);
  }
})();
