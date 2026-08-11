---
"@deadlock-mods/desktop": patch
---

Fix a security issue where a malicious mod archive could write files outside the extraction folder. Archives whose entries use absolute paths or `..` segments are now rejected instead of installed.
