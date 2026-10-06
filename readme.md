<!-- title -->

# github-action-skill-to-pr

<!-- /title -->

<!-- badges -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit)
[![CI](https://github.com/kitschpatrol/github-action-skill-to-pr/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/github-action-skill-to-pr/actions/workflows/ci.yml)

<!-- /badges -->

<!-- description -->

**GitHub Action to run a skill and submit a PR if code changed.**

<!-- /description -->

> [!WARNING]
>
> **The general state of agent skill security is a mess. Only use this action with skills you trust.**

## Overview

This action resolves an agent skill, runs it with [Claude Code](https://github.com/anthropics/claude-code-action), and then uses [create-pull-request](https://github.com/peter-evans/create-pull-request) to commit any resulting changes and open or update a PR.

The action wraps the skill invocation with a prompt telling the agent to work unattended, make routine decisions, and report decisions it must defer. It prohibits commits, pushes, branch changes, and GitHub writes.

One reusable branch is created per skill, defaulting to `automation/<skill>`. Each run rebuilds the branch from the base, so any commits pushed to it by hand are discarded.

If no files are changed by the action, then no new PR is opened. If an existing automation PR no longer differs from the base, then it's closed and its branch is deleted.

This is a composite action for Ubuntu runners. There is no separate configuration file. The caller checks out the base branch at the workspace root and installs any tools, dependencies, and dependency-provided skills the project needs. A shallow clone is fine. The action does not run dependency installation or skill synchronization in your project.

## Usage

```yaml
# .github/workflows/skill-to-pr.yml
name: Run skill

on:
  workflow_dispatch: {}
  schedule:
    - cron: '0 6 * * 1'

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      # Project-specific setup belongs here. For example, install pnpm and
      # Node.js, then run pnpm ci so the project's prepare script syncs skills.

      - uses: kitschpatrol/github-action-skill-to-pr@main
        with:
          skill: ksc-update
          instructions: |
            Apply compatible dependency updates and run the project's checks.
            Defer major upgrades and explain why they need review.
          claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # Optional: use a PAT or GitHub App token for PR publication.
          # github-token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```

`instructions` follows the skill name in Claude's prompt, so it is the skill's argument string. A skill that uses `$ARGUMENTS`, `$0`, or named arguments receives it there; a skill with no placeholder sees it appended as `ARGUMENTS: ...`. Multi-line text is fine.

### Local skills

Without `skill-source`, the action checks these repository-root paths in order:

1. `.claude/skills/<skill>/SKILL.md`
2. `.claude/commands/<skill>.md`
3. `.agents/skills/<skill>/SKILL.md`

Existing symlinks work. An `.agents` skill is exposed to Claude through a temporary directory passed with `--add-dir`, preserving its supporting scripts and resources. The consuming project's setup or `prepare` script must install dependency-provided skills before this action runs. Missing skills fail before Claude starts; the action does not search `node_modules` or run `skills experimental_sync`.

Use the skill's directory name: up to 64 lowercase letters, numbers, and single hyphens, with a letter or number at either end.

### Remote skills

Set `skill-source` to a source supported by the [skills CLI](https://github.com/vercel-labs/skills). The action runs a pinned version of the CLI through `npx` to install just the named skill into a fresh runner temporary directory, then passes that directory to Claude.

```yaml
with:
  skill: web-design-guidelines
  skill-source: vercel-labs/agent-skills
  instructions: Review this project and fix applicable accessibility issues.
  claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

Sources can also be repository URLs, URLs to a repository subdirectory, or direct URLs to `SKILL.md`:

```yaml
skill-source: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
# Or a direct Markdown URL containing the named skill:
# skill-source: https://example.com/skills/my-skill/SKILL.md
```

Prefer a source pinned to a commit for reproducibility. Use a repository source when the skill needs supporting files; a standalone Markdown URL may not include them. Remote sources must be accessible to the runner; the publishing token is not used to authenticate skill downloads. A remote source is rejected if a same-named `.claude` skill or command already exists, avoiding ambiguous skill selection.

### Authentication

Claude needs either a subscription OAuth token from `claude setup-token` or an Anthropic API key. Pass `claude-code-oauth-token` / `anthropic-api-key` as inputs, or set `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` on the action step. An explicit input overrides the corresponding environment variable; OAuth wins when both kinds are set.

```sh
claude setup-token
gh secret set CLAUDE_CODE_OAUTH_TOKEN
# Alternatively, store an API key from the Anthropic Console:
gh secret set ANTHROPIC_API_KEY
```

A GitHub token is required for publication, but you do not have to supply one: `github-token` defaults to the workflow's `github.token`. It needs `contents: write` and `pull-requests: write`, and repository settings must allow GitHub Actions to create pull requests.

For automatic follow-up CI, supply a PAT or GitHub App token with those permissions. GitHub applies special restrictions to events created using `GITHUB_TOKEN`; see [GitHub's workflow triggering rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). If using a separate publishing token, the workflow token can have only `contents: read`. Claude always receives the workflow token; the supplied publishing token is passed only to create-pull-request. The system prompt's restrictions are instructions to the agent, not a sandbox.

### Inputs

| Input                     | Default              | Purpose                                                                                                                                       |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`                   | Required             | Local skill directory name or skill to select from a remote source.                                                                           |
| `skill-source`            | Local lookup         | Repository or URL to install from.                                                                                                            |
| `instructions`            | Empty                | Skill arguments: task details and advance guidance for decisions the skill would normally ask about.                                          |
| `claude-code-oauth-token` | Environment variable | Claude subscription authentication.                                                                                                           |
| `anthropic-api-key`       | Environment variable | API-key authentication when OAuth is absent.                                                                                                  |
| `github-token`            | `github.token`       | PR publishing credential.                                                                                                                     |
| `model`                   | `opus`               | Claude model name or alias.                                                                                                                   |
| `effort`                  | Claude's default     | `low`, `medium`, `high`, `xhigh`, or `max`; [support depends on the model](https://code.claude.com/docs/en/model-config#adjust-effort-level). |
| `max-turns`               | `80`                 | Maximum agent turns. Reaching the limit fails the run and publishes nothing.                                                                  |
| `allowed-bots`            | Empty                | Bot actors allowed by claude-code-action.                                                                                                     |
| `branch`                  | `automation/<skill>` | Reusable PR branch; must differ from the base.                                                                                                |
| `title`                   | `Run <skill>`        | PR title.                                                                                                                                     |
| `commit-message`          | PR title             | Commit message.                                                                                                                               |

### Outputs

| Output                   | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `pull-request-number`    | PR number, when a PR exists.                                                         |
| `pull-request-url`       | PR URL, when a PR exists.                                                            |
| `pull-request-operation` | Operation reported by create-pull-request.                                           |
| `report-path`            | Markdown report in the runner's temporary directory, including when no PR is needed. |

## Development notes

Future versions might expand support to additional agents.

<!-- license -->

## License

[MIT](license.txt) © [Eric Mika](https://ericmika.com)

<!-- /license -->
