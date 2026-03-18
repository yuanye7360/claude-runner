# ClaudeRunner

Automated JIRA issue resolution and PR review system powered by Claude AI. Converts JIRA issues into fully-implemented, tested pull requests.

## Features

- **JIRA to PR automation:** Select JIRA issues, ClaudeRunner creates branches, implements fixes, runs tests, and opens PRs
- **PR review fixer:** Processes review comments and pushes fixes automatically
- **Multi-repo parallel execution:** Work on issues across multiple repos simultaneously
- **Real-time dashboard:** Live progress tracking with phase indicators

## Prerequisites

- macOS
- Node.js >= 20
- [pnpm](https://pnpm.io/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub CLI (gh)](https://cli.github.com/)

## Quick Start

    git clone <repo-url>
    cd ClaudeRunner
    ./setup.sh

The setup script will:

1. Check prerequisites
2. Install dependencies
3. Create `.env` from template (you'll need to fill in JIRA credentials)
4. Set up the SQLite database
5. Build and start the server

Open http://localhost:5688 after setup completes.

## Configuration

### .env (personal secrets, not in git)

| Variable | Description |
| --- | --- |
| JIRA_BASE_URL | Your Atlassian instance URL |
| JIRA_EMAIL | Your Atlassian email |
| JIRA_API_TOKEN | Generate at https://id.atlassian.com/manage-profile/security/api-tokens |
| DATABASE_URL | SQLite path (default: file:./apps/web/claude-runner.db) |

### Web UI Settings

All settings are managed through the Web UI:

- **GitHub Org** — Settings panel (gear icon) → GitHub section
- **Repos** — /repos page (nav bar → Repos)

On first startup, if a `config.yaml` exists from a previous version, it will be automatically migrated to the database and deleted.

## Development

    pnpm dev

Start dev server with hot reload at http://localhost:3000

## Production

    pnpm build
    pnpm pm2:start
    pnpm pm2:logs
    pnpm pm2:stop

## FAQ

**Q: Claude CLI not found?** Ensure `claude` is in your PATH. ClaudeRunner auto-detects it via `which claude` with common fallback paths.

**Q: How do I get a JIRA API token?** Go to https://id.atlassian.com/manage-profile/security/api-tokens and create a new token.

**Q: How do I add repos?** Use the /repos page in the web UI to add, edit, and remove repos.
