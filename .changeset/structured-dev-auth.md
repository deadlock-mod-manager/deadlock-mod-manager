---
"@deadlock-mods/auth": minor
---

Add structured dev authentication system with environment-based configuration

- Created dedicated dev-auth module for centralized configuration
- Dev user credentials are now read from environment variables instead of hardcoded values
- Email/password authentication is conditionally enabled only when DEV_AUTH_SEED_ENABLED=true
- Added validation to ensure proper environment setup before seeding dev users
