---
name: resume
description: Resume work on the Cloudbeds MCP project — reads todo.md and recent git log, then shows open items and the most likely next step. Run at session start.
---

# Resume

At session start, orient quickly without exploring the whole codebase.

## Steps
1. Read `todo.md` (project root). Extract the **Current Sprint** and any **Backlog** items still open.
2. Run `git log --oneline -8` for recent activity, and `git status --short` for uncommitted work.
3. Output a summary **under 20 lines**:
   - **In progress / next:** top 1-3 open todo items.
   - **Recent commits:** last 2-3 lines of git log.
   - **Uncommitted:** anything dirty in the working tree.
   - **One suggested next action.**

## Notes
- Three apps live here: `cloudbeds-mcp/` (stdio), `cloudbeds-mcp-server/` (HTTP),
  `client-portal/` (Next.js + Prisma). See `CLAUDE.md` for the map.
- The two MCP tool/client files are intentional duplicates — changes must be mirrored.
- The sandbox blocks `api.cloudbeds.com` and `api.vercel.com`; live key/deploy
  steps happen on the user's machine or the Vercel dashboard.
- Keep output tight. Don't dump file contents.
