# Database Package

This package contains the PostgreSQL schema and repositories used by Deadlock Mod Manager services, built with Drizzle ORM.

## Commands

```bash
pnpm db:migrate
pnpm db:generate
pnpm db:push
pnpm db:studio
pnpm db:seed
```

Schema modules live in `src/schema`, repositories in `src/repositories`, and generated migrations in `drizzle`.

Before applying migration `0059_tough_william_stryker.sql`, operators must run `bash scripts/export-retired-catalog.sh` against the target database and retain both its compressed dump and SHA-256 checksum. The migration permanently drops the retired `mod`, `mod_download`, and `mirrored_files` tables.
