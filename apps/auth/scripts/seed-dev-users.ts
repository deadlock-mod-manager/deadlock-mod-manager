import "dotenv/config";

import { and, db, eq, schema } from "@deadlock-mods/database";
import { createAppLogger, createLoggerContext } from "@deadlock-mods/logging";
import { hashPassword, verifyPassword } from "better-auth/crypto";

type DevUser = {
  name: string;
  email: string;
  password: string;
  isAdmin?: boolean;
};

const logger = createAppLogger({
  app: "auth-seed",
  environment: process.env.NODE_ENV ?? "development",
  context: createLoggerContext(),
});

const devUsers: DevUser[] = [
  {
    name: "Dev User One",
    email: "dev1@deadlockmods.test",
    password: "devpass-1!",
  },
  {
    name: "Dev User Two",
    email: "dev2@deadlockmods.test",
    password: "devpass-2!",
  },
];

function ensureDevEnvironment() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PROD_AUTH_SEED !== "true"
  ) {
    throw new Error(
      "auth:seed is restricted to non-production environments. Set ALLOW_PROD_AUTH_SEED=true to override.",
    );
  }
}

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
  ensureDevEnvironment();

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
