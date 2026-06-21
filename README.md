# jira-in-branch

Agent hook that blocks `gh pr create` when the current branch has no Jira ticket in its name.

Built with [`@polyhook/sdk`](https://github.com/polyhook/polyhook) — works across Claude Code, Cursor, Windsurf, Cline, and Amp.

## How it works

Intercepts every `bash` tool call. When the command matches `gh pr create` (or `gh pr new`), reads the current git branch and checks for a Jira ticket pattern (`[A-Z][A-Z0-9]+-\d+`).

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
