# Preserve Source 2 layout when editing compiled assets

Foundry edits reuse the compiled resource as a donor so Source 2 keeps its metadata, compression and resource bindings. Keep the texture format and full mip pyramid, and apply mesh edits to every LOD through material bindings while retaining flags the generic encoder would discard.
