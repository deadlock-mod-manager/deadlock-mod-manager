import { db, eq, schema } from "./client";

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
          value: false,
        },
        {
          name: "profile-management",
          description:
            "Enable profile management features (create, edit, switch profiles)",
          value: false,
        },
        {
          name: "plugin-themes",
          description: "Enable Themes plugin",
          value: true,
          exposed: true,
        },
        {
          name: "plugin-background",
          description: "Enable Background plugin",
          value: true,
          exposed: true,
        },
        {
          name: "plugin-discord",
          description: "Enable Discord RPC plugin",
          value: true,
          exposed: true,
        },
        {
          name: "plugin-flashbang",
          description: "Enable Flashbang plugin",
          value: true,
          exposed: true,
        },
      ])
      .onConflictDoNothing();

    // Seed OAuth applications (OIDC trusted clients)
    await db
      .insert(schema.oauthApplication)
      .values([
        {
          clientId: "deadlockmods-www",
          clientSecret: null,
          name: "Deadlock Mod Manager - Web",
          redirectUrls: JSON.stringify([
            "https://deadlockmods.app/auth/callback",
            "http://localhost:3003/auth/callback",
          ]),
          type: "public",
          disabled: false,
          metadata: JSON.stringify({ internal: true }),
        },
        {
          clientId: "deadlockmods-desktop",
          clientSecret: null,
          name: "Deadlock Mod Manager - Desktop",
          redirectUrls: JSON.stringify([
            "https://auth.deadlockmods.app/auth/desktop-callback",
            "http://localhost:3004/auth/desktop-callback",
          ]),
          type: "public",
          disabled: false,
          metadata: JSON.stringify({ internal: true }),
        },
      ])
      .onConflictDoNothing();

    // Ensure public clients have no clientSecret (use PKCE instead)
    await db
      .update(schema.oauthApplication)
      .set({ clientSecret: null })
      .where(eq(schema.oauthApplication.clientId, "deadlockmods-desktop"));
    await db
      .update(schema.oauthApplication)
      .set({ clientSecret: null })
      .where(eq(schema.oauthApplication.clientId, "deadlockmods-www"));

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Failed to seed database:", error);
    process.exit(1);
  }
})();
