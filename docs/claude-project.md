# How Claude works on this repo

This is the public framework. No claude.ai Project is attached to it and no
Claude scheduled task writes to it. Claude works here only in local sessions,
started on purpose, to change the framework. This page records the agent setup
that ships in the repo, so anyone who forks it, and Erik moving his work to a
local setup, knows what loads.

Snapshot taken 2026-11-27 from the repo.

## How it is used

- The framework is meant to be forked. A fork's owner runs `/setup` once, which
  fills the `[PLACEHOLDER]` tokens in `CLAUDE.md` with their own profile.
- Erik's own job search runs in a separate private fork. That fork has its own
  Claude Project and its own setup document. Changes that help every user are
  made here and synced to that fork, never the other way round: nothing
  personal comes into this repo.
- Agents other than Claude Code (Codex, Cursor, Gemini CLI, Antigravity) read
  `AGENTS.md`, which points at the same files.

## Config in the repo

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | The candidate profile template and the workflow rules. |
| `AGENTS.md` | Thin pointer for other agents to `CLAUDE.md` and `.claude/`. |
| `.claude/commands/` | Slash commands: `setup`, `apply`, `rank`, `expand`, `interview`, `outcome`, `add-portal`, `add-template`, `html-report`, `gmail-sync`, `notion-sync`, `sync-upstream`, `reset`. |
| `.claude/skills/` | `job-application-assistant` (profile and evaluation method), `job-scraper` (the `/scrape` workflow), `upskill`. |
| `.claude/agents/gemini-research-expert.md` | A subagent that runs research through the Gemini CLI in headless mode. |
| `.agents/skills/*-search/` | One portal search CLI per job board, in the portable Agent Skills format. `/scrape` runs them. |
| `.claude/settings.json` | Allows the portal CLIs and the `tools/` and `salary_lookup.py` scripts without a prompt, and denies the connectors the framework never needs (travel, finance, databases, hosting, analytics, fitness). Gmail, Google Calendar and Google Drive stay on for `/gmail-sync` and document work. |

No hooks and no `.mcp.json`. Notion sync and Gmail sync use whatever connectors
the user's own Claude account has.

## Automation outside Claude

This repo is itself a fork of `ai-job-search-dev/ai-job-search`.
`.github/workflows/upstream-watch.yml` runs every Monday at 08:00 UTC, on forks
only. It triages the upstream commits this fork lacks into one rolling issue and
never merges or pushes. `ci.yml` runs the tests.
