import { z } from "zod";

export type DevUser = {
  name: string;
  email: string;
  password: string;
  isAdmin: boolean;
};

const devUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string(),
  isAdmin: z.boolean().default(false),
});

const devAuthEnvSchema = z.object({
  DEV_AUTH_SEED_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  DEV_AUTH_USER_1_EMAIL: z.string().email().optional(),
  DEV_AUTH_USER_1_PASSWORD: z.string().min(8).optional(),
  DEV_AUTH_USER_1_NAME: z.string().optional(),
  DEV_AUTH_USER_1_ADMIN: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  DEV_AUTH_USER_2_EMAIL: z.string().email().optional(),
  DEV_AUTH_USER_2_PASSWORD: z.string().min(8).optional(),
  DEV_AUTH_USER_2_NAME: z.string().optional(),
  DEV_AUTH_USER_2_ADMIN: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

type DevAuthEnv = z.infer<typeof devAuthEnvSchema>;

function parseDevAuthEnv(): DevAuthEnv {
  return devAuthEnvSchema.parse(process.env);
}

function buildDevUsers(envConfig: DevAuthEnv): DevUser[] {
  const users: DevUser[] = [];

  if (envConfig.DEV_AUTH_USER_1_EMAIL && envConfig.DEV_AUTH_USER_1_PASSWORD) {
    const user = devUserSchema.parse({
      email: envConfig.DEV_AUTH_USER_1_EMAIL,
      password: envConfig.DEV_AUTH_USER_1_PASSWORD,
      name: envConfig.DEV_AUTH_USER_1_NAME ?? "Dev User One",
      isAdmin: envConfig.DEV_AUTH_USER_1_ADMIN,
    });
    users.push(user);
  }

  if (envConfig.DEV_AUTH_USER_2_EMAIL && envConfig.DEV_AUTH_USER_2_PASSWORD) {
    const user = devUserSchema.parse({
      email: envConfig.DEV_AUTH_USER_2_EMAIL,
      password: envConfig.DEV_AUTH_USER_2_PASSWORD,
      name: envConfig.DEV_AUTH_USER_2_NAME ?? "Dev User Two",
      isAdmin: envConfig.DEV_AUTH_USER_2_ADMIN,
    });
    users.push(user);
  }

  return users;
}

export function getDevAuthConfig(): {
  isEnabled: boolean;
  users: DevUser[];
} {
  const envConfig = parseDevAuthEnv();
  const isEnabled = envConfig.DEV_AUTH_SEED_ENABLED;
  const users = isEnabled ? buildDevUsers(envConfig) : [];

  return { isEnabled, users };
}

export function validateDevAuthSeedRequirements(): void {
  const config = getDevAuthConfig();

  if (!config.isEnabled) {
    throw new Error(
      "Dev auth seed is disabled. Set DEV_AUTH_SEED_ENABLED=true to enable.",
    );
  }

  if (config.users.length === 0) {
    throw new Error(
      "No dev users configured. Set DEV_AUTH_USER_1_EMAIL and DEV_AUTH_USER_1_PASSWORD environment variables.",
    );
  }
}

export function isDevAuthEnabled(): boolean {
  const envConfig = parseDevAuthEnv();
  return envConfig.DEV_AUTH_SEED_ENABLED;
}
