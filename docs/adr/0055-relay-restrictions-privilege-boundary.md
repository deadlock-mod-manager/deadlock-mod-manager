# Use a narrow elevated helper for relay restrictions

Restrict elevation to applying and removing owned firewall rules while keeping the app unprivileged. Support offline removal without the catalog or valid saved preferences, and retain the Linux helper's read-back because unprivileged nftables cannot verify it.
