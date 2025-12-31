---
"@deadlock-mods/www": minor
---

Add light/dark theme toggle and multi-language support to the website

- Added theme toggle (light/dark/system) with browser default detection
- Added language selector supporting 15 languages (en, de, fr, es, it, pt-BR, ja, zh-CN, zh-TW, ru, pl, tr, th, ar, gsw)
- Theme and language preferences are stored in cookies
- Browser defaults are used when no cookie preference exists
- No URL path changes for language/theme (cookie-based only)
- Cookie domain is configurable via VITE_SITE_URL environment variable

