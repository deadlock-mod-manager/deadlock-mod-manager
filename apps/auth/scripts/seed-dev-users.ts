import "dotenv/config";

import { and, db, eq, schema } from "@deadlock-mods/database";
import { createAppLogger, createLoggerContext } from "@deadlock-mods/logging";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  type DevUser,
  getDevAuthConfig,
  validateDevAuthSeedRequirements,
} from "../src/lib/dev-auth";

const logger = createAppLogger({
  app: "auth-seed",
  environment: process.env.NODE_ENV ?? "development",
  context: createLoggerContext(),
});

async function ensureCredentialAccount(
  userId: string,
  password: string,
): Promise<void> {
  const existingAccount = await db.query.account.findFirst({
    where: and(
      eq(schema.account.userId, userId),
      eq(schema.account.providerId, "credential"),
    ),
  });

  if (existingAccount?.password) {
    const isValid = await verifyPassword({
      hash: existingAccount.password,
      password,
    });
    if (isValid && existingAccount.accountId === userId) {
      return;
    }
  }

  const passwordHash = await hashPassword(password);

  if (existingAccount) {
    await db
      .update(schema.account)
      .set({
        accountId: userId,
        password: passwordHash,
      })
      .where(eq(schema.account.id, existingAccount.id));
    return;
  }

  await db.insert(schema.account).values({
    userId,
    providerId: "credential",
    accountId: userId,
    password: passwordHash,
  });
}

async function upsertUser(
  entry: DevUser,
): Promise<{ email: string; userId: string }> {
  const email = entry.email.toLowerCase();
  const desiredAdmin = entry.isAdmin === true;

  const existingUser = await db.query.user.findFirst({
    where: eq(schema.user.email, email),
  });

  if (existingUser) {
    const updates: Partial<(typeof schema.user)["$inferInsert"]> = {};

    if (existingUser.name !== entry.name) {
      updates.name = entry.name;
    }
    if (!existingUser.emailVerified) {
      updates.emailVerified = true;
    }
    if (existingUser.isAdmin !== desiredAdmin) {
      updates.isAdmin = desiredAdmin;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.user)
        .set(updates)
        .where(eq(schema.user.id, existingUser.id));
    }

    await ensureCredentialAccount(existingUser.id, entry.password);
    return { email, userId: existingUser.id };
  }

  const inserted = await db
    .insert(schema.user)
    .values({
      name: entry.name,
      email,
      emailVerified: true,
      isAdmin: desiredAdmin,
    })
    .returning({ id: schema.user.id });

  const created = inserted[0];
  if (!created) {
    throw new Error(`Failed to insert user record for ${email}`);
  }

  await ensureCredentialAccount(created.id, entry.password);

  return { email, userId: created.id };
}

async function main() {
  validateDevAuthSeedRequirements();

  const config = getDevAuthConfig();
  const devUsers = config.users;

  logger.info("Starting dev user seeding", { userCount: devUsers.length });

  for (const user of devUsers) {
    const result = await upsertUser(user);
    logger.info("Seeded dev user", result);
  }

  logger.info("Completed auth dev user seeding", { total: devUsers.length });
}

main().catch((error) => {
  logger.withError(error).error("auth:seed failed");
  process.exit(1);
});
