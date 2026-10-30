#!/usr/bin/env bash
# Builds the installer and (optionally) publishes it as a GitHub release that VanMule's updater picks up.
#   tools/make-release.sh            -> build + write dist/release-notes.md
#   tools/make-release.sh owner/repo -> also create the GitHub release with `gh` (needs `gh auth login`)
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
sed -i "s/^!define VERSION \".*\"/!define VERSION \"$VER\"/; s/^VIProductVersion \".*\"/VIProductVersion \"$VER.0\"/" build/installer.nsi
cp ../vanmule-web/vanmule.html app/index.html 2>/dev/null || true
rm -rf dist/win-unpacked
npx electron-builder --win dir --x64
(cd build && makensis -V2 installer.nsi)
EXE="dist/VanMule-Setup-$VER.exe"
SHA=$(sha256sum "$EXE" | cut -d' ' -f1)
NOTES=$(node -e "const l=require('./app/changelog.json').find(e=>e.version==='$VER'); console.log(l?l.items.map(i=>'- '+i).join('\n'):'')")
printf '%s\n\nSHA256: %s\n' "$NOTES" "$SHA" > dist/release-notes.md
echo "Built $EXE"; echo "SHA256 $SHA"
if [ "${1:-}" != "" ]; then
  gh release create "v$VER" "$EXE" --repo "$1" --title "VanMule $VER" --notes-file dist/release-notes.md
  echo "Published v$VER to $1"
fi
