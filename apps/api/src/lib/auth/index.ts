import { db, schema } from "@deadlock-mods/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "../env";
import { steam } from "./plugins/steam";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
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
      sameSite: "none",
      secure: true,
      httpOnly: true,
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
  ],
});
