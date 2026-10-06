#!/usr/bin/env bash
set -euo pipefail

# Keep uses: ...@v1 pointing at the release just published by bumpp.
version=$(node -p "require('./package.json').version")
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Version $version is a prerelease, leaving the major tag alone"
	exit 0
fi
major_tag="v${version%%.*}"
git tag --force "$major_tag" "v${version}^{commit}"
git push --force origin "$major_tag"
