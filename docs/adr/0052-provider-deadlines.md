# Budget upstream calls below the API deadline

Some API handlers aggregate data from multiple providers. Give provider calls deadlines below the full request timeout so a handler can return partial results when a provider responds slowly.
