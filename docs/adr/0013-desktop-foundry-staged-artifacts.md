# Stage Foundry previews and serve binary artifacts separately

Stage VPKs to keep preview readers from locking user files while the manager reconciles them, and copy only the directory VPK for the oversized game archive. Carry preview descriptors over IPC and GLB bytes through the private asset protocol.
