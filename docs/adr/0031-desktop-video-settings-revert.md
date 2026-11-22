# Track video.txt edits outside the engine file

Deadlock and Steam can rewrite video.txt without preserving markers. Record per-key original and written values in app state, revert keys still holding the app's value, and keep a complete backup for explicit restoration.
