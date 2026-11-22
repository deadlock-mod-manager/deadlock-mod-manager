# Isolate plugin execution and broker granted access

Run plugin guests in separate worker processes so the host can end a stalled invocation and contain crashes. Broker host calls through manifest-scoped grants, revoke access from stale sessions after updates, and scope file access to handles rooted in the user's selected path.
