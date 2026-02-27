# API Security (Hono + oRPC)

Covers the backend API server built with Hono 4.x on Bun, using oRPC for type-safe RPC
endpoints, Drizzle ORM for database access, and better-auth for authentication.

## Injection

### SQL Injection

Drizzle ORM parameterizes by default, but raw SQL is still possible.

```typescript
// VULNERABLE: String interpolation in raw SQL
const result = await db.execute(
  sql`SELECT * FROM mods WHERE name = '${userInput}'`
);

// VULNERABLE: Raw SQL in Drizzle
const result = await db.execute(
  sql.raw(`SELECT * FROM mods WHERE name LIKE '%${search}%'`)
);

// SAFE: Drizzle query builder (parameterized)
const result = await db
  .select()
  .from(mods)
  .where(eq(mods.name, userInput));

// SAFE: Drizzle sql template with proper placeholders
const result = await db.execute(
  sql`SELECT * FROM mods WHERE name = ${userInput}`
);
// Note: sql`` template tag auto-parameterizes ${} — this is safe
// Only sql.raw() with interpolation is dangerous
```

### NoSQL / Object Injection

```typescript
// VULNERABLE: Unvalidated object as query filter
const user = await db
  .select()
  .from(users)
  .where(userInput); // if userInput is a crafted SQL expression

// SAFE: Validate with Zod before using in queries
const input = z.object({ name: z.string().max(100) }).parse(raw);
const user = await db.select().from(users).where(eq(users.name, input.name));
```

## Authorization

### oRPC Procedure Levels

```typescript
// SAFE: Proper procedure hierarchy
export const publicProcedure = baseProcedure;   // no auth
export const protectedProcedure = baseProcedure  // session required
  .use(authMiddleware);
export const adminProcedure = protectedProcedure // admin only
  .use(adminMiddleware);

// VULNERABLE: Sensitive operation on public procedure
export const deleteMod = publicProcedure
  .input(z.object({ modId: z.number() }))
  .mutation(async ({ input }) => {
    await db.delete(mods).where(eq(mods.id, input.modId));
  });

// SAFE: Admin-only operation
export const deleteMod = adminProcedure
  .input(z.object({ modId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    await db.delete(mods).where(eq(mods.id, input.modId));
  });
```

### IDOR (Insecure Direct Object Reference)

```typescript
// VULNERABLE: No ownership check
export const updateProfile = protectedProcedure
  .input(z.object({ userId: z.string(), bio: z.string() }))
  .mutation(async ({ input }) => {
    await db.update(users).set({ bio: input.bio }).where(eq(users.id, input.userId));
  });

// SAFE: Use session user ID, not client-supplied ID
export const updateProfile = protectedProcedure
  .input(z.object({ bio: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await db.update(users).set({ bio: input.bio }).where(eq(users.id, ctx.user.id));
  });
```

## Input Validation

```typescript
// VULNERABLE: No validation on oRPC input
export const searchMods = publicProcedure
  .mutation(async ({ input }: { input: any }) => {
    return db.select().from(mods).where(like(mods.name, `%${input.query}%`));
  });

// SAFE: Zod schema validation
export const searchMods = publicProcedure
  .input(z.object({
    query: z.string().min(1).max(100),
    page: z.number().int().min(1).max(100).default(1),
    limit: z.number().int().min(1).max(50).default(20),
  }))
  .query(async ({ input }) => {
    return db.select().from(mods)
      .where(like(mods.name, `%${input.query}%`))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);
  });
```

## CORS & Headers

```typescript
// VULNERABLE: Wildcard CORS with credentials
app.use(cors({ origin: '*', credentials: true }));

// VULNERABLE: Reflecting Origin header
app.use(cors({ origin: (origin) => origin }));

// SAFE: Explicit allowlist
app.use(cors({
  origin: ['https://deadlockmods.app', 'https://auth.deadlockmods.app'],
  credentials: true,
}));
```

## Rate Limiting

```typescript
// VULNERABLE: No rate limiting on auth endpoints
app.post('/auth/login', loginHandler);

// SAFE: Rate limited
app.post('/auth/login', rateLimiter({ max: 10, window: '15m' }), loginHandler);
```

## Detection Patterns

```
# Raw SQL usage
grep -rn 'sql\.raw\|\.execute(' --include='*.ts'
grep -rn "sql\`.*\$\{" --include='*.ts'

# Public procedures doing sensitive operations
grep -rn 'publicProcedure' --include='*.ts' -A 10 | grep 'delete\|update\|insert'

# Missing Zod validation
grep -rn 'mutation\|query' --include='*.ts' | grep -v '.input('

# CORS configuration
grep -rn 'cors(' --include='*.ts'

# IDOR patterns — client-supplied IDs for ownership
grep -rn 'input\.userId\|input\.user_id' --include='*.ts'
```

## Checklist

- [ ] All mutations/queries use Zod `.input()` validation
- [ ] No raw SQL with string interpolation (`sql.raw()` with `${}`)
- [ ] Sensitive operations use `protectedProcedure` or `adminProcedure`
- [ ] No IDOR: ownership derived from `ctx.user.id`, not client input
- [ ] CORS configured with explicit origin allowlist, no wildcard with credentials
- [ ] Rate limiting on authentication endpoints
- [ ] Pagination capped with max limit
- [ ] Error responses don't expose stack traces, SQL errors, or internal paths
- [ ] Request IDs logged for audit trail
