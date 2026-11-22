# Keep plugin network grants and transport checks at distinct boundaries

The runtime stays network-free and approves guest requests only for user-granted HTTPS hosts. Desktop transport applies the approved destination to the actual connection, rejects redirects and non-public addresses, and caps request duration and response size. Catalog installs stage bounded archives in the desktop layer, and the runtime verifies their digest before installation.
