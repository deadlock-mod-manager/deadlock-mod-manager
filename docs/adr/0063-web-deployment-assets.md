# Cache content-hashed web assets as immutable

Cache hashed assets indefinitely, allow updates to stable public paths and return a missing response for unavailable assets so a CDN cannot cache HTML at a JavaScript URL. A browser holding HTML from a prior deployment can reload once to pick up the active build.
