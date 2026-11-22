# Relaunch Flatpak through a detached host helper

The old sandbox shuts down its own child processes and holds the singleton lock until it exits. Detach the host helper and wait for the sandbox to disappear before relaunching.
