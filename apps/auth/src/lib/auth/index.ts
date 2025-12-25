import { db, schema } from "@deadlock-mods/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt, oidcProvider } from "better-auth/plugins";
import { env } from "../env";
import { steam } from "./plugins/steam";

const isProduction = env.NODE_ENV === "production";
const isDevelopment = env.NODE_ENV === "development";

function getRedirectUrls(productionUrl: string, localUrl: string): string[] {
  const urls: string[] = [productionUrl];
  if (isDevelopment) {
    urls.push(localUrl);
  }
  return urls;
}

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
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      httpOnly: true,
    },
    crossSubDomainCookies: isProduction
      ? {
          enabled: true,
          domain: ".deadlockmods.app",
        }
      : {
          enabled: false,
        },
  },
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    steam({
      steamApiKey: env.STEAM_API_KEY,
      accountLinking: true,
    }),
    jwt(),
    oidcProvider({
      loginPage: "/login",
      allowDynamicClientRegistration: false,
      useJWTPlugin: true,
      getAdditionalUserInfoClaim: async (user) => ({
        isAdmin: (user as { isAdmin?: boolean }).isAdmin ?? false,
      }),
      trustedClients: [
        {
          clientId: "deadlockmods-www",
          name: "DeadlockMods Web",
          type: "public",
          redirectUrls: getRedirectUrls(
            "https://deadlockmods.app/auth/callback",
            "http://localhost:3003/auth/callback",
          ),
          disabled: false,
          skipConsent: true,
          metadata: { internal: true },
        },
        {
          clientId: "deadlockmods-desktop",
          name: "DeadlockMods Desktop",
          type: "public",
          redirectUrls: getRedirectUrls(
            "https://auth.deadlockmods.app/auth/desktop-callback",
            "http://localhost:3004/auth/desktop-callback",
          ),
          disabled: false,
          skipConsent: true,
          metadata: { internal: true },
        },
      ],
    }),
  ],
});

export type Auth = typeof auth;
export type SteamAuth = ReturnType<typeof steam>;
