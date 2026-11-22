# Sign the Windows executable before signing the installer

Build and sign the application executable first, then bundle it with Tauri's in-place bundle-type rewrite disabled so the executable keeps its signature. Sign the installer separately and exercise the same sequence in the release test workflow.
