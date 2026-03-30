# ClaudeRunner

AI-powered development automation platform. Automates JIRA issue implementation, PR creation, and code review via Claude CLI.

## Tech Stack

- **Framework:** Nuxt 4 (Vue 3) + TypeScript (strict)
- **UI:** Nuxt UI v4 + Tailwind CSS
- **Database:** SQLite via Prisma (better-sqlite3 adapter)
- **Package Manager:** pnpm (monorepo with Turborepo)
- **Node:** >= 18.0.0

## Project Structure

```
apps/web/
├── app/                    # Nuxt 4 source directory
│   ├── app.vue             # Root layout: sidebar + header + main
│   ├── app.config.ts       # Nuxt UI theme config (primary: violet)
│   ├── assets/css/main.css # Linear minimal theme CSS variables
│   ├── components/         # Vue components (auto-imported)
│   ├── composables/        # Vue composables (auto-imported)
│   ├── layouts/            # Nuxt layouts
│   └── pages/              # File-based routing
├── server/
│   ├── api/                # Nitro API routes
│   │   ├── claude-runner/  # Job execution, streaming, history
│   │   ├── pr-review/      # PR review automation
│   │   └── pr-runner/      # PR creation automation
│   └── utils/              # Server utilities (jobStore, prisma)
├── prisma/
│   └── schema.prisma       # Database schema
├── nuxt.config.ts          # Nuxt configuration
└── tailwind.config.ts      # Tailwind extended config
```

## Key Architecture

### Job Execution Flow

1. Frontend calls `POST /api/claude-runner/run` with issues + config
2. Backend creates Job in memory (`jobStore.ts`), spawns Claude CLI processes
3. Real-time SSE streaming via `/api/claude-runner/jobs/[id]/stream`
4. Events: `chunk` (output), `phase` (progress), `heartbeat`, `eof`
5. On completion: `persistJob()` saves to SQLite (including phases per issue)
6. Frontend composable `useRunnerJob.ts` manages state + SSE connection

### UI Design System (Linear Minimal)

- **Background:** `#0a0a0f` (pure black, no gradients)
- **Sidebar:** `#0a0a12`, fixed 180px with icon + text labels
- **Borders:** `rgba(255,255,255,0.06)` (ultra-thin white)
- **Text:** `#fafafa` (primary), `#888` (secondary), `#444` (muted)
- **Semantic colors:** `#8b5cf6` (JIRA/primary), `#06b6d4` (PR), `#22c55e` (Review/success), `#f59e0b` (warning)
- **Border radius:** 10px (cards), 8px (buttons), 6px (small elements)
- No glow effects, no gradients on surfaces, minimal shadows

### Composables

| Composable | Purpose |
| --- | --- |
| `useRunnerJob` | Core job execution state, SSE streaming, phase tracking |
| `useJiraRunner` | JIRA issue automation orchestration |
| `usePrReviewRunner` | PR creation automation |
| `usePrReviewer` | Code review automation |
| `useRepoConfigs` | Repository configuration CRUD |
| `useSkills` | Skill management, mode presets |
| `useDashboard` | Dashboard filtering, KPI calculation |
| `useOutputParser` | Parse job output into structured phases |

### Pages & Routing

| Route          | Page                                 |
| -------------- | ------------------------------------ |
| `/`            | Redirects to `/dashboard`            |
| `/dashboard`   | KPI cards, charts, job history table |
| `/jira-runner` | JIRA issue selection + execution     |
| `/pr-runner`   | PR creation from branches            |
| `/pr-review`   | Code review for open PRs             |
| `/repos`       | Repository configuration             |
| `/skills`      | Skill management + mode presets      |
| `/jobs/[id]`   | Job detail with phase timeline       |

## Development

```bash
pnpm install
pnpm dev          # Start dev server (port 3000)
pnpm build        # Production build
pnpm lint         # Run all linters
```

### Database

```bash
cd apps/web
npx prisma db push    # Apply schema changes
npx prisma studio     # Browse data
```

## Coding Conventions

### Commit Messages

Use conventional commits with `web` scope for frontend changes:

```
feat(web): description
fix(web): description
refactor(web): description
style(web): description
```

Commitlint enforces scope-enum — only allowed scopes are package names.

### Linting

- **ESLint** + **Prettier** for JS/TS/Vue
- **Stylelint** for CSS (requires modern color notation: `rgb(r g b / alpha%)`, not `rgba()`)
- **lefthook** runs pre-commit hooks automatically
- Property order enforced in CSS (`order/properties-order`)
- Tailwind canonical class names preferred (e.g., `w-45` not `w-[180px]`)

### Component Patterns

- Use Nuxt auto-imports (no manual imports for composables, components, Vue APIs)
- Props use `defineProps<{}>()` with TypeScript interfaces
- Colors use inline style or Tailwind arbitrary values referencing the design system
- Nuxt UI components: `UIcon`, `UTooltip`, `UApp`, `NuxtLink`
- Icon sets: `i-lucide-*`, `i-heroicons-*`

### Important Notes

- PR Runner API (`/api/pr-runner/prs`) filters by configured repos only
- PR Review API (`/api/pr-review/prs`) takes `repoLabel` param, queries configured repos
- Job phases are persisted to `JobResult.phases` (JSON) for structured display
- `useRunnerJob` uses localStorage for active job persistence across page refreshes
- Mode (Smart/Normal) stored in localStorage as `cr-mode`, applies skill presets on change
