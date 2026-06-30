# jira-in-branch

Agent hook that blocks `gh pr create` when the current branch has no Jira ticket in its name.

Built with [`@polyhook/sdk`](https://github.com/polyhook/polyhook) — works across Claude Code, Cursor, Windsurf, Cline, and Amp.

## How it works

Intercepts every `bash` tool call. When the command opens a PR — either `gh pr create` / `gh pr new`, or a REST call that creates one (`gh api .../pulls` with a POST-inducing method or field flag) — it resolves the PR's head branch and checks for a Jira ticket pattern (`[A-Z][A-Z0-9]+-\d+`).

The branch it validates is the one the PR is actually for: the head stated in the command (`--head`/`-H`, or the `head=` field for the REST path; a fork `owner:branch` is reduced to `branch`) when present, otherwise the current git branch. This matters because the hook runs in the agent's working directory, which is often not the directory — or even the repository — the PR targets (e.g. a git worktree whose branch is named after the worktree, or a submodule the `gh` call `cd`s into); reading only the local branch there validates the wrong thing.

Listing PRs (`gh api .../pulls --method GET`) and updating a specific PR (`gh api .../pulls/123`) are not blocked.

| Branch | Result |
|--------|--------|
| `feat/PROJ-123-my-feature` | ✅ allowed |
| `main` | ❌ blocked |
| `fix-login-bug` | ❌ blocked |

## Install

```bash
pnpm add -D jira-in-branch
```

## Wire up

### Claude Code

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "pnpm exec jira-in-branch"
      }]
    }]
  }
}
```

### Other agents

Same binary works for Cursor, Windsurf, Cline, and Amp — `@polyhook/sdk` detects the caller automatically. Replace the `command` value above with the equivalent hook config for your agent.

## License

MIT
