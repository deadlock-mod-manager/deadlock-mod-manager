# Accept DeadlockForge builds over a local browser bridge

DeadlockForge builds VPK bytes locally in the browser, which leaves no download URL for the deep-link installer. Use a dedicated loopback bridge with requests scoped by browser origin and preflight and a port range distinct from Grimoire's.
