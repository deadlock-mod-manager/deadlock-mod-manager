# Recover interrupted creator workspace installs from host state

A plugin instance can stop after starting installation and before committing local bookkeeping. Persist a pending snapshot hash before calling the host, reconcile it with host state on a later call and preserve the primary installation error if bookkeeping also fails.
