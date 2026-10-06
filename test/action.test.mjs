import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url))

function fixture(context) {
	const root = mkdtempSync(join(tmpdir(), 'skill-to-pr-test-'))
	context.after(() => rmSync(root, { recursive: true, force: true }))
	const workspace = join(root, 'repo with spaces')
	const temp = join(root, 'runner temp')
	mkdirSync(workspace)
	mkdirSync(temp)
	const env = {
		...process.env,
		GITHUB_WORKSPACE: workspace,
		RUNNER_TEMP: temp,
		GITHUB_OUTPUT: join(temp, 'output'),
		GITHUB_STEP_SUMMARY: join(temp, 'summary'),
		ANTHROPIC_API_KEY: '',
		CLAUDE_CODE_OAUTH_TOKEN: '',
		STP_API_KEY: '',
		STP_OAUTH_TOKEN: '',
		STP_HAS_GITHUB_TOKEN: 'true',
		STP_SKILL: 'example',
		STP_SOURCE: '',
		STP_BRANCH: '',
		STP_MODEL: 'opus',
		STP_EFFORT: '',
		STP_MAX_TURNS: '80',
		STP_CONCLUSION: 'success',
		STP_RUN_URL: 'https://github.com/example/repo/actions/runs/1',
	}
	function git(...args) {
		const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' })
		assert.equal(result.status, 0, result.stderr)
		return result.stdout.trim()
	}
	git('init', '-b', 'main')
	git('config', 'user.name', 'Fixture')
	git('config', 'user.email', 'fixture@example.com')
	git('config', 'commit.gpgsign', 'false')
	git('commit', '--allow-empty', '-m', 'Initial commit')
	function write(path, content = 'Run the fixture skill.\n') {
		const target = join(workspace, path)
		mkdirSync(join(target, '..'), { recursive: true })
		writeFileSync(target, content)
	}
	function run(script, overrides = {}) {
		return spawnSync('bash', [join(scripts, script)], {
			cwd: workspace,
			env: { ...env, ...overrides },
			encoding: 'utf8',
		})
	}
	function outputs() {
		return Object.fromEntries(
			readFileSync(env.GITHUB_OUTPUT, 'utf8')
				.trim()
				.split('\n')
				.map((line) => {
					const separator = line.indexOf('=')
					return [line.slice(0, separator), line.slice(separator + 1)]
				}),
		)
	}
	function prepare(overrides = {}) {
		const result = run('prepare.sh', overrides)
		assert.equal(result.status, 0, result.stdout + result.stderr)
		const values = outputs()
		env.STP_DIRECTORY = values.directory
		return values
	}
	return { workspace, temp, env, git, write, run, outputs, prepare }
}

test('authentication fails without credentials', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh')
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /Provide claude-code-oauth-token/)
})

test('OAuth wins over an API key and only the chosen credential is masked', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh', {
		STP_OAUTH_TOKEN: 'oauth-secret',
		STP_API_KEY: 'api-secret',
		ANTHROPIC_API_KEY: 'env-api-secret',
	})
	assert.equal(result.status, 0, result.stderr)
	assert.deepEqual(f.outputs(), { 'oauth-token': 'oauth-secret', 'api-key': '' })
	assert.equal(result.stdout, '::add-mask::oauth-secret\n')
})

test('environment credentials apply when inputs are empty', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh', { ANTHROPIC_API_KEY: 'env-api-secret' })
	assert.equal(result.status, 0, result.stderr)
	assert.deepEqual(f.outputs(), { 'oauth-token': '', 'api-key': 'env-api-secret' })
	assert.equal(result.stdout, '::add-mask::env-api-secret\n')
})

test('an input credential overrides the environment credential of the same kind', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh', {
		STP_API_KEY: 'input-secret',
		ANTHROPIC_API_KEY: 'env-api-secret',
	})
	assert.equal(result.status, 0, result.stderr)
	assert.equal(f.outputs()['api-key'], 'input-secret')
})

test('an empty publishing token fails before Claude runs', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh', {
		STP_OAUTH_TOKEN: 'oauth-secret',
		STP_HAS_GITHUB_TOKEN: 'false',
	})
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /github-token is empty/)
})

test('credentials containing line breaks are rejected before reaching outputs', (context) => {
	const f = fixture(context)
	const result = f.run('auth.sh', { STP_API_KEY: 'secret\ninjected=value' })
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /line breaks/)
})

test('local Claude skill takes precedence and preparation/reporting leaves no diff', (context) => {
	const f = fixture(context)
	f.write('.claude/skills/example/SKILL.md')
	f.write('.agents/skills/example/SKILL.md', 'A different skill.\n')
	f.git('add', '.')
	f.git('commit', '-m', 'Add skills')
	const outputs = f.prepare()
	assert.equal(outputs.branch, 'automation/example')
	assert.equal(outputs['system-prompt'], join(outputs.directory, 'system-prompt.md'))
	const systemPrompt = readFileSync(outputs['system-prompt'], 'utf8')
	assert.ok(systemPrompt.includes('/example skill'))
	assert.ok(systemPrompt.includes(`"${outputs.directory}/report.md"`))
	assert.equal(f.run('report.sh').status, 0)
	assert.match(readFileSync(join(outputs.directory, 'body.md'), 'utf8'), /did not write a report/)
	assert.equal(f.git('status', '--porcelain'), '')
})

test('legacy command file is accepted as a local skill', (context) => {
	const f = fixture(context)
	f.write('.claude/commands/example.md')
	const outputs = f.prepare()
	assert.equal(outputs.branch, 'automation/example')
})

test('agents skill retains supporting files through its temporary Claude link', (context) => {
	const f = fixture(context)
	f.write('.agents/skills/example/SKILL.md')
	f.write('.agents/skills/example/scripts/helper.sh', 'echo helper\n')
	const outputs = f.prepare({ STP_BRANCH: 'maintenance/example' })
	assert.equal(outputs.branch, 'maintenance/example')
	assert.equal(
		readFileSync(join(outputs.directory, '.claude/skills/example/scripts/helper.sh'), 'utf8'),
		'echo helper\n',
	)
	assert.equal(f.git('status', '--porcelain'), '?? .agents/')
})

test('missing local skill fails without attempting dependency discovery', (context) => {
	const f = fixture(context)
	f.write('node_modules/package/skills/example/SKILL.md')
	const result = f.run('prepare.sh')
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /Run project setup first/)
})

test('remote install receives literal arguments and keeps all installation artifacts outside Git', (context) => {
	const f = fixture(context)
	const bin = join(f.temp, 'bin')
	mkdirSync(bin)
	writeFileSync(
		join(bin, 'npx'),
		`#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "$RUNNER_TEMP/arguments"
mkdir -p ".claude/skills/$STP_SKILL/scripts"
printf 'Remote skill' > ".claude/skills/$STP_SKILL/SKILL.md"
printf 'Helper' > ".claude/skills/$STP_SKILL/scripts/helper.sh"
printf '{}' > skills-lock.json
`,
		{ mode: 0o755 },
	)
	const source = 'https://example.com/skills/SKILL.md?value=$(touch unexpected)'
	const outputs = f.prepare({ STP_SOURCE: source, PATH: `${bin}:${process.env.PATH}` })
	assert.deepEqual(readFileSync(join(f.temp, 'arguments'), 'utf8').trim().split('\n'), [
		'--yes',
		'skills@1.7.0',
		'add',
		source,
		'--skill',
		'example',
		'--agent',
		'claude-code',
		'--yes',
		'--copy',
	])
	assert.equal(
		readFileSync(join(outputs.directory, '.claude/skills/example/SKILL.md'), 'utf8'),
		'Remote skill',
	)
	assert.equal(f.git('status', '--porcelain'), '')
})

for (const existing of ['.claude/skills/example/SKILL.md', '.claude/commands/example.md']) {
	test(`explicit remote source fails on an existing ${existing}`, (context) => {
		const f = fixture(context)
		f.write(existing)
		const result = f.run('prepare.sh', { STP_SOURCE: 'owner/repo' })
		assert.notEqual(result.status, 0)
		assert.match(result.stderr, /already exists/)
	})
}

for (const overrides of [
	{ STP_SKILL: '../escape' },
	{ STP_SKILL: 'Example' },
	{ STP_SKILL: 'example\ninjected=value' },
	{ STP_BRANCH: 'main' },
	{ STP_BRANCH: 'bad branch' },
	{ STP_MODEL: 'opus --other-option' },
	{ STP_EFFORT: 'extreme' },
	{ STP_MAX_TURNS: '0' },
]) {
	test(`rejects invalid inputs ${JSON.stringify(overrides)}`, (context) => {
		const f = fixture(context)
		f.write('.claude/skills/example/SKILL.md')
		assert.notEqual(f.run('prepare.sh', overrides).status, 0)
	})
}

test('detached checkout fails before Claude', (context) => {
	const f = fixture(context)
	f.git('checkout', '--detach')
	assert.match(f.run('prepare.sh').stderr, /not a detached commit/)
})

for (const location of ['outside any repository', 'in a subdirectory of the repository']) {
	test(`a workspace ${location} fails before Claude`, (context) => {
		const f = fixture(context)
		f.write('.claude/skills/example/SKILL.md')
		const workspace = location.startsWith('outside')
			? join(f.temp, 'elsewhere')
			: join(f.workspace, 'nested')
		mkdirSync(workspace)
		const result = f.run('prepare.sh', { GITHUB_WORKSPACE: workspace })
		assert.notEqual(result.status, 0)
		assert.match(result.stderr, /not a repository root/)
	})
}

test('report preserves changes and truncates the PR body without breaking UTF-8', (context) => {
	const f = fixture(context)
	f.write('.claude/skills/example/SKILL.md')
	f.git('add', '.')
	f.git('commit', '-m', 'Skill')
	const { directory } = f.prepare()
	f.write('new-file.txt', 'A real change.\n')
	f.write('.claude/skills/example/SKILL.md', 'A tracked modification.\n')
	const status = f.git('status', '--porcelain')
	const report = `# Report\n${'界'.repeat(22000)}`
	writeFileSync(join(directory, 'report.md'), report)
	const result = f.run('report.sh')
	assert.equal(result.status, 0, result.stderr)
	const body = readFileSync(join(directory, 'body.md'), 'utf8')
	assert.ok(body.length < 65536)
	assert.ok(!body.includes('�'))
	assert.match(body, /Report truncated/)
	assert.ok(body.includes(f.env.STP_RUN_URL))
	assert.equal(readFileSync(f.env.GITHUB_STEP_SUMMARY, 'utf8'), report)
	assert.equal(f.git('status', '--porcelain'), status)
})

test('an unsuccessful Claude conclusion prevents publication of partial changes', (context) => {
	const f = fixture(context)
	f.write('.claude/skills/example/SKILL.md')
	f.prepare()
	f.write('partial.txt', 'Unfinished work')
	const result = f.run('report.sh', { STP_CONCLUSION: 'failure' })
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /Refusing to publish partial changes/)
})

for (const change of ['commit', 'branch', 'detach']) {
	test(`refuses publication if Claude changes the ${change}`, (context) => {
		const f = fixture(context)
		f.write('.claude/skills/example/SKILL.md')
		f.prepare()
		if (change === 'commit') {
			f.git('commit', '--allow-empty', '-m', 'Unexpected commit')
		} else if (change === 'branch') {
			f.git('checkout', '-b', 'unexpected')
		} else {
			f.git('checkout', '--detach')
		}
		const result = f.run('report.sh')
		assert.notEqual(result.status, 0)
		assert.match(result.stderr, /Refusing to publish/)
	})
}
