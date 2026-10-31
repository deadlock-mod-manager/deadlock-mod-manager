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
          name: "plugin-themes",
          description: "Enable Themes plugin",
          value: true,
          exposed: true,
        },
        {
          name: "plugin-discord",
          description: "Enable Discord RPC plugin",
          value: true,
          exposed: true,
        },
      ])
      .onConflictDoNothing();

    // Seed the first-party OAuth clients (public, PKCE, no consent screen)
    const oauthClients = [
      {
        clientId: "deadlockmods-www",
        name: "Deadlock Mod Manager - Web",
        redirectUris: [
          "https://deadlockmods.app/auth/callback",
          "http://localhost:3003/auth/callback",
        ],
      },
      {
        clientId: "deadlockmods-desktop",
        name: "Deadlock Mod Manager - Desktop",
        redirectUris: [
          "https://auth.deadlockmods.app/auth/desktop-callback",
          "http://localhost:3004/auth/desktop-callback",
        ],
      },
    ];
    for (const client of oauthClients) {
      await db
        .insert(schema.oauthClient)
        .values({
          ...client,
          disabled: false,
          skipConsent: true,
          scopes: ["openid", "profile", "email", "offline_access"],
          tokenEndpointAuthMethod: "none",
          applicationType: "web",
          grantTypes: ["authorization_code", "refresh_token"],
          responseTypes: ["code"],
          requirePKCE: true,
          metadata: { internal: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.oauthClient.clientId,
          set: { redirectUris: client.redirectUris, updatedAt: new Date() },
        });
    }

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Failed to seed database:", error);
    process.exit(1);
  }
})();
