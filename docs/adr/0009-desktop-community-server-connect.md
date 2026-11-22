# Retry community server joins through Steam after startup

Deadlock can ignore a boot-time +connect, and Steam’s connect handler needs a ready client and a literal address. Pass the game argument for a fast join and watch the game log so a missed join can be retried through Steam after the menu is ready.
