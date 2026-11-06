# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-11-01

### Maintenance

- Update `anthropics/claude-code-action` from v1.0.263 to v1.0.266, bringing Claude Code 2.1.316.
- Update contributor tooling to pnpm 12.16.1, remove dependency-age exemptions, and include ignored `.claude` files in `clean-deep` cleanup.
- Update the repository's dependency-update workflow to use Skill to PR v1.2.0.

## [1.2.0] - 2026-10-27

### Added

- Discover pnpm-installed Claude skills by their frontmatter name and invoke their prefixed directory command, preserving direct local-skill precedence and rejecting ambiguous matches.

### Documentation

- Document pnpm-installed skill lookup precedence and invocation by directory name.
- Add a latest-release badge to the README.

### Maintenance

- Update `anthropics/claude-code-action` from v1.0.243 to v1.0.263 and the remote skill installer from `skills@1.7.0` to `skills@1.7.2`.
- Migrate contributor skill installation to pnpm's native skills support for `.agents/skills` and `.claude/skills`, removing the experimental synchronization hook and development dependency on `skills`.
- Update shared-config to `^8.14.0` and pnpm to 12.15.0, set contributor Node.js support to `^24.16.0 || >=26.3.0`, and refresh dependency-install settings, including an ESLint 10 peer allowance.
- Refresh CI and release action pins, including `github-action-release` v3.0.3, and switch dependency-update automation to monthly runs with an explicit PR title.
- Make repository and website link checks exclude loopback URLs and tolerate empty results.
- Add regression tests for pnpm skill invocation, mismatched declared names, and ambiguous skills supplied by multiple packages.

## [1.1.1] - 2026-10-07

### Documentation

- Clarify run reports, prompt customization, authentication setup, required repository permissions and settings, and automatic `GITHUB_TOKEN`/`GH_TOKEN` availability to Claude's tools.

### Maintenance

- Update `anthropics/claude-code-action` from v1.0.242 to v1.0.243.
- Add weekly and manually triggered `ksc-update` automation to prepare dependency-update pull requests.
- Update shared-config to `^8.12.1` and pnpm to 12.9.1, and refresh contributor ignore rules and dependency-age exemptions.

## [1.1.0] - 2026-10-06

### Added

- Add an `arguments` input for text passed directly after the skill invocation, including multiline arguments.

### Changed

- **Breaking:** Move `instructions` into the system prompt as standing guidance and advance approvals; workflows supplying skill arguments through `instructions` must move that text to `arguments`.

### Fixed

- Fail before Claude starts when `github-token` is empty, with guidance for unset secrets and using the default workflow token.

### Documentation

- Explain the separate argument and instruction inputs, update examples to use `@v1`, and expand publishing-token and environment-variable guidance.

### Maintenance

- Add regression coverage for empty publishing tokens and workflow instructions appended to the system prompt.

## [1.0.0] - 2026-10-06

### Added

- Introduce an Ubuntu composite GitHub Action that runs skills unattended with Claude Code, with configurable task text, model, effort, turn limits, and allowed bot actors.
- Discover local skills in `.claude/skills`, legacy `.claude/commands`, and `.agents/skills`, preserving symlinks and access to supporting resources.
- Install named remote skills from repositories or supported URLs through `skill-source`, keeping downloaded files and installation artifacts outside the checkout.
- Accept Claude OAuth tokens or API keys through inputs or environment variables, prefer OAuth, and support workflow, PAT, or GitHub App tokens for PR publication.
- Create or update PRs on reusable `automation/<skill>` branches rebuilt from the base, with configurable branch, title, and commit message; close obsolete PRs and delete their branches.
- Include Markdown reports in PR descriptions and workflow summaries, with fallback descriptions and safe truncation; expose PR number, URL, operation, and temporary report path as outputs.
- Validate inputs and require a base-branch checkout at the workspace root; refuse publication after unsuccessful Claude runs, unexpected commits, or branch switches.

### Documentation

- Provide workflow examples and guidance for project setup, local and remote skills, authentication, permissions, branch behavior, inputs, and outputs.

### Maintenance

- Establish pnpm contributor tooling, automated tests, linting and security checks, link checking, and release automation with moving major-version tags.

[1.0.0]: https://github.com/kitschpatrol/github-action-skill-to-pr/releases/tag/v1.0.0
[1.1.0]: https://github.com/kitschpatrol/github-action-skill-to-pr/compare/v1.0.0...v1.1.0
[1.1.1]: https://github.com/kitschpatrol/github-action-skill-to-pr/compare/v1.1.0...v1.1.1
[1.2.0]: https://github.com/kitschpatrol/github-action-skill-to-pr/compare/v1.1.1...v1.2.0
[1.2.1]: https://github.com/kitschpatrol/github-action-skill-to-pr/compare/v1.2.0...v1.2.1
