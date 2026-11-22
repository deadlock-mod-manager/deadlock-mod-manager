# Build byte-reproducible creator workspace packages

Write sorted uncompressed ZIP entries with fixed timestamps and no extra fields. Strip checkout-specific Rust panic paths so equivalent inputs and toolchains yield the same package bytes.
