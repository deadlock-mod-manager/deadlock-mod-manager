-- 0062 kept the oidcProvider tables for rollback. The new provider has been
-- live since then, so they can go.
DROP TABLE IF EXISTS "oauth_access_token_legacy", "oauth_consent_legacy", "oauth_application_legacy";
