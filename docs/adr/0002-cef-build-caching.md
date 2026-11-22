# Cache the CEF dependency tree on nightly Windows

The Windows target path is kept short, outside the project workspace, and parts of the CEF build are outside sccache coverage. Cache the dependency tree only on nightly builds, discard partial restores and exclude packaged outputs, preserving clean release builds.
