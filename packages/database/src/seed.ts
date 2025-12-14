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

    // Seed OAuth applications (OIDC trusted clients)
    await db
      .insert(schema.oauthApplication)
      .values([
        {
          clientId: "deadlockmods-www",
          clientSecret:
            "sk_web_" +
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15),
          name: "Deadlock Mod Manager - Web",
          redirectUrls: JSON.stringify([
            "https://deadlockmods.app/auth/callback",
            "http://localhost:3003/auth/callback",
          ]),
          type: "web",
          disabled: false,
          metadata: JSON.stringify({ internal: true }),
        },
        {
          clientId: "deadlockmods-desktop",
          clientSecret:
            "sk_desktop_" +
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15),
          name: "Deadlock Mod Manager - Desktop",
          redirectUrls: JSON.stringify([
            "https://auth.deadlockmods.app/auth/desktop-callback",
            "http://localhost:3004/auth/desktop-callback",
          ]),
          type: "native",
          disabled: false,
          metadata: JSON.stringify({ internal: true }),
        },
      ])
      .onConflictDoNothing();

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Failed to seed database:", error);
    process.exit(1);
  }
})();
