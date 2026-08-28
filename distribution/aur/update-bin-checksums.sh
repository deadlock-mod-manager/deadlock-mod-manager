#!/usr/bin/env bash
set -euo pipefail

pkgbuild_path="${1:-distribution/aur/deadlock-modmanager-bin/PKGBUILD}"
if [[ ! -f "${pkgbuild_path}" ]]; then
    printf 'ERROR: PKGBUILD not found: %s\n' "${pkgbuild_path}" >&2
    exit 1
fi

version="$(sed -n 's/^_pkgver=//p' "${pkgbuild_path}")"
if [[ -z "${version}" ]]; then
    printf 'ERROR: _pkgver is missing from %s\n' "${pkgbuild_path}" >&2
    exit 1
fi

repository='https://github.com/deadlock-mod-manager/deadlock-mod-manager'
raw_repository='https://raw.githubusercontent.com/deadlock-mod-manager/deadlock-mod-manager'

hash_url() {
    local url="$1"
    curl --fail --location --silent --show-error "${url}" | sha256sum | cut -d' ' -f1
}

deb_sha256="$(hash_url "${repository}/releases/download/v${version}/Deadlock.Mod.Manager_${version}_amd64.deb")"
desktop_sha256="$(hash_url "${raw_repository}/v${version}/distribution/aur/deadlock-modmanager.desktop")"
metainfo_sha256="$(hash_url "${raw_repository}/v${version}/apps/desktop/src-tauri/dev.stormix.deadlock-mod-manager.metainfo.xml")"

sed -i "s/^_deb_sha256=.*/_deb_sha256=${deb_sha256}/" "${pkgbuild_path}"
sed -i "s/^_desktop_sha256=.*/_desktop_sha256=${desktop_sha256}/" "${pkgbuild_path}"
sed -i "s/^_metainfo_sha256=.*/_metainfo_sha256=${metainfo_sha256}/" "${pkgbuild_path}"

if grep -q "'SKIP'\|\"SKIP\"" "${pkgbuild_path}"; then
    printf 'ERROR: %s still contains an unverified source\n' "${pkgbuild_path}" >&2
    exit 1
fi

printf 'Updated v%s source checksums in %s\n' "${version}" "${pkgbuild_path}"

