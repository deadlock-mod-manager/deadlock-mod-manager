import { oauthProvider } from "@better-auth/oauth-provider";
import { db, schema } from "@deadlock-mods/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { env } from "../env";
import { steam } from "./plugins/steam";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false, // don't allow user to set isAdmin during signup
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  trustedOrigins: env.CORS_ORIGIN,
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      secure: env.NODE_ENV === "production",
      httpOnly: true,
    },
    crossSubDomainCookies:
      env.NODE_ENV === "production"
        ? {
            enabled: true,
            domain: ".deadlockmods.app",
          }
        : { enabled: false },
  },
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    },
  },
  plugins: [
    steam({
      steamApiKey: env.STEAM_API_KEY,
      accountLinking: true,
    }),
    jwt(),
    oauthProvider({
      loginPage: "/login",
      // Both first-party clients skip consent, so this page is never shown.
      consentPage: "/login",
      cachedTrustedClients: new Set([
        "deadlockmods-www",
        "deadlockmods-desktop",
      ]),
      // Released desktop builds refresh concurrently with the same token; without
      // a grace window the second refresh revokes the whole token family.
      refreshTokenReuseInterval: 60,
      customUserInfoClaims: async ({ user }) => ({
        isAdmin: user.isAdmin === true,
      }),
      rateLimit: {
        // The API introspects every bearer token here from shared server IPs.
        userinfo: false,
      },
    }),
  ],
});

export type Auth = typeof auth;
export type SteamAuth = ReturnType<typeof steam>;
