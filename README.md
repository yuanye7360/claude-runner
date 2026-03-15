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

### config.yaml (team defaults, in git)

Defines default repos, GitHub org, and Claude CLI settings. See the file for the full schema.

### config.local.yaml (personal overrides, not in git)

Override any value from config.yaml. Example - different repo path:

    repos:
      - name: b2c-web
        path: ~/projects/kkday-b2c-web

### UI Customization

You can also add/edit/remove repos from the web interface. UI changes are stored in SQLite and take precedence over YAML config.

Priority: UI customizations > config.local.yaml > config.yaml

## Development

    pnpm dev

Start dev server with hot reload at http://localhost:3000

## Production

    pnpm build
    pnpm pm2:start
    pnpm pm2:logs
    pnpm pm2:stop

## FAQ

**Q: Claude CLI not found?** Set claude.cliPath in config.yaml or config.local.yaml to the full path.

**Q: How do I get a JIRA API token?** Go to https://id.atlassian.com/manage-profile/security/api-tokens and create a new token.

**Q: Can I add repos not in config.yaml?** Yes. Either add them to config.local.yaml or use the web UI to add custom repos.
