# Persist launch-health evidence across app exits

Persist the active setup and queue observations until acknowledged so they survive an app shutdown. Combine process exit status, crash dumps, console activity and app stops because each signal can be ambiguous in isolation.
