-- Better Auth 1.7 removes the oidcProvider plugin. Its replacement,
-- @better-auth/oauth-provider, keeps clients in oauth_client and stores
-- tokens as SHA-256 hashes in oauth_refresh_token and a reshaped
-- oauth_access_token. The legacy tables are renamed rather than dropped so a
-- rollback can rename them back; drop them once the cutover is settled.
ALTER TABLE "oauth_application" RENAME TO "oauth_application_legacy";
--> statement-breakpoint
ALTER INDEX "oauth_application_pkey" RENAME TO "oauth_application_legacy_pkey";
--> statement-breakpoint
ALTER TABLE "oauth_access_token" RENAME TO "oauth_access_token_legacy";
--> statement-breakpoint
ALTER INDEX "oauth_access_token_pkey" RENAME TO "oauth_access_token_legacy_pkey";
--> statement-breakpoint
ALTER TABLE "oauth_consent" RENAME TO "oauth_consent_legacy";
--> statement-breakpoint
ALTER INDEX "oauth_consent_pkey" RENAME TO "oauth_consent_legacy_pkey";
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked" timestamp,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);

--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}',
	"user_id" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);

--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL
);

--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp
);

--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked" timestamp,
	"rotated_at" timestamp,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp,
	"auth_time" timestamp,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);

--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp,
	"updated_at" timestamp,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);

--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN "alg" text;
--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN "crv" text;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_client_id" ON "oauth_access_token" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_session_id" ON "oauth_access_token" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_user_id" ON "oauth_access_token" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_authorization_code_id" ON "oauth_access_token" USING btree ("authorization_code_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_access_token_refresh_id" ON "oauth_access_token" USING btree ("refresh_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_client_user_id" ON "oauth_client" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oauth_client_resource_client_resource" ON "oauth_client_resource" USING btree ("client_id","resource_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_client_resource_resource_id" ON "oauth_client_resource" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_consent_client_id" ON "oauth_consent" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_consent_user_id" ON "oauth_consent" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_refresh_token_client_id" ON "oauth_refresh_token" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_refresh_token_session_id" ON "oauth_refresh_token" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_refresh_token_user_id" ON "oauth_refresh_token" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_oauth_refresh_token_authorization_code_id" ON "oauth_refresh_token" USING btree ("authorization_code_id");
--> statement-breakpoint
-- Both first-party clients were public PKCE clients configured as
-- oidcProvider trustedClients; the new plugin reads clients from the table.
-- Only https redirect URIs are carried over: the old config allowed the
-- localhost ones in development only, and the seed adds them locally.
INSERT INTO "oauth_client" (
	"id", "client_id", "name", "disabled", "skip_consent", "scopes",
	"redirect_uris", "token_endpoint_auth_method", "application_type",
	"grant_types", "response_types", "require_pkce", "metadata",
	"created_at", "updated_at"
)
SELECT
	"id",
	"client_id",
	"name",
	"disabled",
	true,
	ARRAY['openid', 'profile', 'email', 'offline_access'],
	ARRAY(
		SELECT "uri" FROM jsonb_array_elements_text("redirect_urls"::jsonb) AS "uri"
		WHERE "uri" LIKE 'https://%'
	),
	'none',
	'web',
	ARRAY['authorization_code', 'refresh_token'],
	ARRAY['code'],
	true,
	"metadata"::jsonb,
	coalesce("created_at", now()),
	coalesce("updated_at", now())
FROM "oauth_application_legacy";
--> statement-breakpoint
-- Carry live refresh and access tokens over so signed-in desktop and web users
-- stay signed in. The plugin looks tokens up by base64url(SHA-256(token)).
INSERT INTO "oauth_refresh_token" (
	"id", "token", "client_id", "user_id", "scopes", "expires_at", "created_at"
)
SELECT
	"id",
	rtrim(translate(encode(sha256(convert_to("refresh_token", 'UTF8')), 'base64'), '+/', '-_'), '='),
	"client_id",
	"user_id",
	string_to_array("scopes", ' '),
	"refresh_token_expires_at",
	coalesce("created_at", now())
FROM "oauth_access_token_legacy"
WHERE "refresh_token_expires_at" > now();
--> statement-breakpoint
INSERT INTO "oauth_access_token" (
	"id", "token", "client_id", "user_id", "refresh_id", "scopes",
	"expires_at", "created_at"
)
SELECT
	gen_random_uuid()::text,
	rtrim(translate(encode(sha256(convert_to("access_token", 'UTF8')), 'base64'), '+/', '-_'), '='),
	"client_id",
	"user_id",
	"id",
	string_to_array("scopes", ' '),
	"access_token_expires_at",
	coalesce("created_at", now())
FROM "oauth_access_token_legacy"
WHERE "access_token_expires_at" > now()
	AND "refresh_token_expires_at" > now();
