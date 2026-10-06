// pnpm resolves optional peers from anywhere in the workspace, so better-auth's
// optional `next` peer gets satisfied by apps/docs and drags next (and sharp)
// into every better-auth consumer. None of them use better-auth/next-js.
function readPackage(pkg) {
  if (pkg.name === "better-auth") {
    delete pkg.peerDependencies?.next;
    delete pkg.peerDependenciesMeta?.next;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
