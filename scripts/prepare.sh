#!/usr/bin/env bash
set -euo pipefail

fail() {
	echo "::error::$*" >&2
	exit 1
}

cd "$GITHUB_WORKSPACE"

[[ "$STP_SKILL" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ && ${#STP_SKILL} -le 64 ]] \
	|| fail 'skill must be at most 64 lowercase letters, numbers, and single hyphens, starting and ending with a letter or number.'
[[ "$STP_MODEL" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:-]*$ ]] || fail 'Invalid model name or alias.'
[[ -z "${STP_EFFORT:-}" || "$STP_EFFORT" =~ ^(low|medium|high|xhigh|max)$ ]] || fail 'effort must be low, medium, high, xhigh, or max.'
[[ "$STP_MAX_TURNS" =~ ^[1-9][0-9]*$ ]] || fail 'max-turns must be a positive integer.'

[[ "$(git rev-parse --show-toplevel 2> /dev/null)" == "$(pwd -P)" ]] \
	|| fail 'The workspace is not a repository root. Check out the repository at the workspace root, without the path input of actions/checkout.'
base=$(git symbolic-ref --quiet --short HEAD) || fail 'Check out the PR base branch, not a detached commit.'
branch="${STP_BRANCH:-automation/$STP_SKILL}"
git check-ref-format --branch "$branch" > /dev/null || fail 'Invalid PR branch name.'
[[ "$branch" != "$base" ]] || fail 'The PR branch must differ from the checked-out base branch.'

directory=$(mktemp -d "$RUNNER_TEMP/skill-to-pr.XXXXXX")
git rev-parse HEAD > "$directory/head"
printf '%s\n' "$base" > "$directory/base"
mkdir -p "$directory/.claude/skills"

if [[ -n "${STP_SOURCE:-}" ]]; then
	# Avoid ambiguous Claude skill precedence when a source is explicitly selected.
	[[ ! -e ".claude/skills/$STP_SKILL" && ! -e ".claude/commands/$STP_SKILL.md" ]] \
		|| fail 'A Claude skill or command with this name already exists. Omit skill-source to use the local skill.'
	# Install outside the checkout, keeping downloaded files and locks out of the PR.
	(
		cd "$directory"
		DISABLE_TELEMETRY=1 GIT_TERMINAL_PROMPT=0 npx --yes skills@1.7.0 add "$STP_SOURCE" \
			--skill "$STP_SKILL" --agent claude-code --yes --copy
	)
	[[ -f "$directory/.claude/skills/$STP_SKILL/SKILL.md" ]] || fail 'The source did not install the requested skill.'
elif [[ -f ".claude/skills/$STP_SKILL/SKILL.md" || -f ".claude/commands/$STP_SKILL.md" ]]; then
	: # Already discoverable by Claude, including skills installed by project setup.
elif [[ -f ".agents/skills/$STP_SKILL/SKILL.md" ]]; then
	# Claude loads skills from --add-dir. Preserve access to all supporting files.
	ln -s "$GITHUB_WORKSPACE/.agents/skills/$STP_SKILL" "$directory/.claude/skills/$STP_SKILL"
else
	fail "Skill '$STP_SKILL' not found in .claude/skills, .claude/commands, or .agents/skills. Run project setup first or provide skill-source."
fi

# The harness instructions ride in the system prompt so that the skill receives
# only the caller's instructions as its argument string.
cat > "$directory/system-prompt.md" << PROMPT
This is an unattended CI run of the /$STP_SKILL skill in the checked-out repository, started by a GitHub Actions workflow. The user's message invokes the skill; any text after the skill name is the task's additional instructions and decision guidance.

Run the skill through to completion. Never ask questions, request confirmation, or wait for a reply, even when the skill normally calls for it. Make reasonable routine implementation decisions using the repository's conventions and the additional instructions. Treat those instructions as advance approval for the decisions they explicitly cover. Defer destructive, out-of-scope, or otherwise high-impact decisions that still need human input, continue independent work, and explain what you deferred in the report.

Do not commit, push, switch branches, open a PR, or write to the GitHub API. Leave the resulting changes in the working tree. A later step handles commits and the pull request. Do not manufacture changes if the skill has nothing to do.

When finished, use the Write tool to save your final report as Markdown to "$directory/report.md". Write it even when nothing changed. It becomes the PR description: start with a short summary, then describe the changes, validation and its results, assumptions, and deferred decisions. Include any final report required by the skill. Keep credentials and other secrets out of the report.
PROMPT

{
	printf 'directory=%s\n' "$directory"
	printf 'system-prompt=%s\n' "$directory/system-prompt.md"
	printf 'branch=%s\n' "$branch"
} >> "$GITHUB_OUTPUT"
