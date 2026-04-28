# Authentication Security

Covers better-auth configuration, Steam OAuth, session management, token storage,
and the desktop↔web authentication flow.

## better-auth Configuration

```typescript
// VULNERABLE: Weak or missing secret
const auth = betterAuth({
  secret: "dev-secret", // hardcoded, predictable
  // or missing entirely
});

// VULNERABLE: No CSRF protection
const auth = betterAuth({
  advanced: { disableCSRFCheck: true },
});

// SAFE: Strong secret from environment
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET, // 32+ chars, high entropy
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: ["https://deadlockmods.app"],
});
```

## OAuth / Steam Integration

### Vulnerable Patterns

```typescript
// VULNERABLE: No state parameter validation in OAuth callback
app.get("/auth/callback", async (req) => {
  const code = req.query.code;
  const token = await exchangeCode(code); // no state check = CSRF
  return createSession(token);
});

// VULNERABLE: Open redirect after auth
app.get("/auth/callback", async (req) => {
  // ... exchange code ...
  return redirect(req.query.redirect_uri); // attacker controls destination
});

// VULNERABLE: Steam OpenID without signature verification
app.get("/auth/steam/callback", async (req) => {
  const steamId = req.query["openid.claimed_id"]; // trusting unsigned claim
  return loginBySteamId(steamId);
});
```

### Safe Patterns

```typescript
// SAFE: State parameter validated
app.get("/auth/callback", async (req) => {
  const { code, state } = req.query;
  if (state !== session.oauthState) {
    return error(403, "Invalid state");
  }
  const token = await exchangeCode(code);
  return createSession(token);
});

// SAFE: Redirect URI validated against allowlist
const ALLOWED_REDIRECTS = [
  "https://deadlockmods.app",
  "deadlock-mod-manager://auth/callback",
];
function validateRedirect(uri: string): boolean {
  return ALLOWED_REDIRECTS.some((allowed) => uri.startsWith(allowed));
}
```

## Desktop Auth Flow

The desktop app uses deep links for OAuth callbacks:
`deadlock-mod-manager://auth/callback?code=...&state=...`

### Vulnerable Patterns

```rust
// VULNERABLE: Deep link parameters used without validation
#[tauri::command]
fn handle_auth_callback(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url)?;
    let code = parsed.query_pairs().find(|(k, _)| k == "code").unwrap().1;
    let token = exchange_code(&code)?; // code not validated
    store_token(&token)?;
    Ok(())
}

// VULNERABLE: Token stored in plaintext config file
fn store_token(token: &str) -> io::Result<()> {
    std::fs::write("~/.config/dmm/token.json", token)
}
```

### Safe Patterns

```rust
// SAFE: Validate deep link origin and parameters
#[tauri::command]
fn handle_auth_callback(url: String) -> Result<(), AppError> {
    let parsed = Url::parse(&url).map_err(|_| AppError::InvalidUrl)?;

    // Verify the scheme
    if parsed.scheme() != "deadlock-mod-manager" {
        return Err(AppError::InvalidScheme);
    }

    // Validate state parameter matches stored state
    let state = get_query_param(&parsed, "state")?;
    let expected_state = get_stored_oauth_state()?;
    if state != expected_state {
        return Err(AppError::InvalidOAuthState);
    }

    let code = get_query_param(&parsed, "code")?;
    let token = exchange_code(&code)?;
    store_token_securely(&token)?; // OS keychain
    Ok(())
}
```

## Session Security

```typescript
// VULNERABLE: Session token in URL
app.get("/api/data?token=abc123", handler);

// VULNERABLE: Long-lived sessions without rotation
const session = createSession({ expiresIn: "365d" });

// SAFE: HTTP-only cookies, rotated sessions
const auth = betterAuth({
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rotate daily
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: "__Host-", // secure prefix
  },
});
```

## Token Storage (Desktop)

```rust
// VULNERABLE: Plaintext token in app data
fn store_token(token: &str) -> Result<()> {
    let store = app.store("config.json");
    store.set("auth_token", token); // readable by any local process
}

// SAFE: OS keychain (preferred for sensitive tokens)
fn store_token(token: &str) -> Result<()> {
    let keyring = keyring::Entry::new("deadlock-mod-manager", "auth-token")?;
    keyring.set_password(token)?;
    Ok(())
}

// ACCEPTABLE: Tauri plugin-store with encryption (if keychain unavailable)
// Note: still readable by processes with same user permissions
```

## Detection Patterns

```
# Hardcoded secrets
grep -rn 'BETTER_AUTH_SECRET\|secret.*=.*"' --include='*.ts' | grep -v '.env'

# OAuth state validation
grep -rn 'callback\|oauth\|openid' --include='*.ts' --include='*.rs'

# Token storage
grep -rn 'store_auth_token\|set_password\|token.*write\|token.*save' --include='*.rs' --include='*.ts'

# Session configuration
grep -rn 'session.*expire\|cookie.*age\|maxAge' --include='*.ts'

# Deep link handling
grep -rn 'deep_link\|parse_deep_link' --include='*.rs'

# Redirect validation
grep -rn 'redirect\|redirect_uri\|return_url' --include='*.ts'
```

## Checklist

- [ ] `BETTER_AUTH_SECRET` loaded from environment, not hardcoded
- [ ] OAuth state parameter validated on all callback endpoints
- [ ] Steam OpenID response signatures verified
- [ ] Deep link parameters validated (scheme, state, origin)
- [ ] Redirect URIs validated against strict allowlist
- [ ] Sessions use HTTP-only, Secure, SameSite cookies
- [ ] Session rotation enabled (periodic re-auth)
- [ ] Auth tokens stored in OS keychain, not plaintext files
- [ ] Failed auth attempts rate-limited
- [ ] CSRF protection enabled in better-auth (not disabled)
