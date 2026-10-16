---
"@deadlock-mods/desktop": patch
---

Add large local mods, up to about a gigabyte, without crashing. Files chosen in the file picker are copied without loading them into the window, dropped files are saved to disk in pieces as soon as they are dropped, and ZIP archives are extracted the same way as RAR and 7z, so every VPK they contain is imported. Replacing a mod's VPK by dropping a file also no longer loads the whole file at once.
