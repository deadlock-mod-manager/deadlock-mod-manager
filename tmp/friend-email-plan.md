# Current State
- `FriendEntryDto` exposes the `email` field, and `toFriendEntryDto` always populates it, leaking private data through the public friends API.

# Final State
- `FriendEntryDto` no longer includes an `email` property, and `toFriendEntryDto` omits email so the public friends endpoint cannot expose it.

# Files to Change
- `packages/shared/src/dto/friend.dto.ts`

# Task Checklist
- [ ] Update `FriendEntryDto` type definition to drop the `email` field.
- [ ] Remove email mapping inside `toFriendEntryDto`.
- [ ] Verify no callers expect `email` and adjust types if needed.

