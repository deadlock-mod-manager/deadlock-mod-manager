# Publish APT metadata after its immutable packages

APT clients and caches can retain old indexes and package URLs across a refresh. Publish reproducible, content-addressed packages before their indexes, publish signed release metadata last and prune superseded packages after the new indexes are live. The regular and CEF components share a package name so either component can upgrade an existing installation.
