# Keep UI state migrations idempotent and versioned

Upgrades can start from any historical state version and may replay migrations. Retain idempotent migration steps and supply new top-level defaults through merge, reserving explicit steps for transformations merge cannot perform.
