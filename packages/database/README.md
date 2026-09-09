# Database Package

This package contains the database layer for the Deadlock Mod Manager, built with Drizzle ORM and PostgreSQL.

## Features

- **Drizzle ORM Integration**: Type-safe database operations
- **Repository Pattern**: Clean abstraction layer for database operations
- **PostgreSQL Support**: Optimized for PostgreSQL databases
- **Schema Management**: Centralized database schema definitions

## Usage

### Basic Database Access

```typescript
import { db } from "@deadlock-mods/database";

// Direct database access (for complex queries)
const result = await db.select().from(mods);
```

### Repository Pattern (Recommended)

```typescript
import {
  repositories,
  modRepository,
  modDownloadRepository,
  customSettingsRepository,
} from "@deadlock-mods/database";

// Using the centralized repository service
const allMods = await repositories.mods.findAll();
const mod = await repositories.mods.findByRemoteId("12345");

// Using individual repository instances
const allMods = await modRepository.findAll();
const downloads = await modDownloadRepository.findByModId("mod_123");
const settings = await customSettingsRepository.findAll();
```

## Repository Methods

### ModRepository

- `findAll()` - Get all mods ordered by last update
- `findById(id)` - Find mod by internal ID
- `findByRemoteId(remoteId)` - Find mod by remote provider ID
- `create(mod)` - Create a new mod
- `update(id, mod)` - Update mod by internal ID
- `updateByRemoteId(remoteId, mod)` - Update mod by remote ID
- `upsertByRemoteId(mod)` - Create or update mod by remote ID
- `delete(id)` - Delete mod by internal ID
- `deleteByRemoteId(remoteId)` - Delete mod by remote ID
- `exists(id)` - Check if mod exists by internal ID
- `existsByRemoteId(remoteId)` - Check if mod exists by remote ID

### ModDownloadRepository

- `findAll()` - Get all mod downloads
- `findById(id)` - Find download by ID
- `findByModId(modId)` - Find downloads for a specific mod
- `findByRemoteId(remoteId)` - Find download by remote ID
- `create(modDownload)` - Create a new download
- `update(id, modDownload)` - Update download by ID
- `updateByModId(modId, modDownload)` - Update downloads for a mod
- `upsertByModId(modId, modDownload)` - Create or update download for a mod
- `delete(id)` - Delete download by ID
- `deleteByModId(modId)` - Delete all downloads for a mod
- `deleteByRemoteId(remoteId)` - Delete download by remote ID
- `exists(id)` - Check if download exists

### CustomSettingsRepository

- `findAll()` - Get all settings
- `findById(id)` - Find setting by ID
- `findByKey(key)` - Find setting by key
- `create(setting)` - Create a new setting
- `update(id, setting)` - Update setting by ID
- `updateByKey(key, setting)` - Update setting by key
- `upsertByKey(setting)` - Create or update setting by key
- `delete(id)` - Delete setting by ID
- `deleteByKey(key)` - Delete setting by key
- `exists(id)` - Check if setting exists by ID
- `existsByKey(key)` - Check if setting exists by key

## Database Scripts

```bash
# Run migrations
pnpm db:migrate

# Generate migrations
pnpm db:generate

# Push schema changes
pnpm db:push

# Open Drizzle Studio
pnpm db:studio

# Seed database
pnpm db:seed
```

## Schema

The database includes the following tables:

- **mods** - Game modifications with metadata
- **mod_download** - Download information for mods
- **custom_setting** - User-defined settings

## Migration

When updating the schema:

1. Modify `src/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review the generated migration in `drizzle/` directory
