# Keep existing KeyValues offsets and provide byte ranges for edits

Published KeyValues AST positions count Unicode scalar values. Preserve those offsets for existing consumers and expose UTF-8 byte ranges separately so editors can splice the original source without corrupting multibyte text.
