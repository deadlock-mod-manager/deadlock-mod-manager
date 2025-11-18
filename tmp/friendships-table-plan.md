# Current State
- User friendships are stored in three array columns on `auth.user`: `friends`, `incomingFriendRequests`, and `outgoingFriendRequests`.
- `UserRepository` reads and writes these arrays to maintain friend and request state, and the API layer performs array manipulation per request.
- Migrations and schema do not have a normalized table for friendship relationships, limiting query flexibility and risking inconsistencies.

# Final State
- Introduce a normalized `friendships` table with `user_id`, `friend_id`, `status`, and `created_at`, enforcing referential integrity.
- Migrate existing array data into the new table within a single migration, representing accepted friendships and pending requests with appropriate status values.
- Update the Drizzle schema, repository logic, and API handlers to interact solely with the `friendships` table, using transactions for multi-step operations.
- Remove the now-obsolete array columns from the `user` table schema.

# Files to Change
- `packages/database/src/schema/auth.ts`
- `packages/database/src/schema/relations.ts`
- `packages/database/src/repositories/user.repository.ts`
- `packages/database/src/client.ts` (if needed)
- `apps/api/src/routers/v2/friends.ts`
- `packages/shared/src/dto/friend.dto.ts` (if friend state types need adjustments)
- New migration in `packages/database/drizzle/`
- Any affected DTOs or helpers referencing the old array structure

# Task Checklist
- [ ] Define `friendships` table in schema with enums, constraints, and indexes; drop array columns.
- [ ] Create migration to build table, backfill data from arrays, add constraints, and remove array columns.
- [ ] Refactor repository methods to query/update the new `friendships` table.
- [ ] Update API friend routes to use new repository methods with transaction safety.
- [ ] Adjust DTOs/types to reflect new data sources.
- [ ] Add changeset entries for affected packages.

