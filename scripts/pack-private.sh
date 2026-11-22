#!/usr/bin/env bash
# Builds every plugin in private/ and keeps one installable zip per plugin in private/_zips/
# (<id>@<version>.zip: manifest.json + index.js, fixed timestamps so rebuilding the same code
# gives the same file). Older versions of the same plugin are removed. private/ is never
# published, so these zips are the backup to install from or send.
#
# Usage: scripts/pack-private.sh [plugin-folder ...]   (no arguments: all of them)
set -euo pipefail
cd "$(dirname "$0")/.."
out="private/_zips"
mkdir -p "$out"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
	for m in private/*/manifest.json; do names+=("$(basename "$(dirname "$m")")"); done
fi
for name in "${names[@]}"; do
	dir="private/$name"
	[ -f "$dir/manifest.json" ] || { echo "skip $name (no manifest)"; continue; }
	id=$(node -p "require('./$dir/manifest.json').id")
	version=$(node -p "require('./$dir/manifest.json').version")
	npx valenced-plugin build "$name" --plugins-dir private >/dev/null
	stage=$(mktemp -d)
	cp "$dir/manifest.json" "$dir/build/js/index.js" "$stage/"
	touch -d '1980-02-01 00:00' "$stage"/*
	find "$out" -maxdepth 1 -name "${id}@*.zip" -delete
	(cd "$stage" && zip -q -X "$OLDPWD/$out/${id}@${version}.zip" manifest.json index.js)
	rm -rf "${stage:?}"
	echo "packed $out/${id}@${version}.zip"
done
