# Repair VPK crash state through mutation entry points

Reads examine committed state, and mutation entry points repair staged files and incomplete metadata. Flush file contents before replacing the manifest so a power loss cannot preserve the manifest path with incomplete bytes.
