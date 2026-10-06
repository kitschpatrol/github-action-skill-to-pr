#!/usr/bin/env bash
set -euo pipefail

fail() {
	echo "::error::$*" >&2
	exit 1
}

oauth="${STP_OAUTH_TOKEN:-${CLAUDE_CODE_OAUTH_TOKEN:-}}"
api_key="${STP_API_KEY:-${ANTHROPIC_API_KEY:-}}"
[[ -n "${oauth}${api_key}" ]] \
	|| fail 'Provide claude-code-oauth-token (from claude setup-token) or anthropic-api-key, or the corresponding environment variable.'
[[ "${oauth}${api_key}" != *$'\n'* ]] || fail 'Credentials must not contain line breaks.'
[[ "${STP_HAS_GITHUB_TOKEN:-}" == 'true' ]] \
	|| fail 'github-token is empty. The secret it references is probably unset; omit the input to publish with github.token.'

# Pass a single credential to Claude so the CLI never has to choose between them.
if [[ -n "$oauth" ]]; then api_key=''; fi
[[ -z "$oauth" ]] || echo "::add-mask::$oauth"
[[ -z "$api_key" ]] || echo "::add-mask::$api_key"
{
	printf 'oauth-token=%s\n' "$oauth"
	printf 'api-key=%s\n' "$api_key"
} >> "$GITHUB_OUTPUT"
