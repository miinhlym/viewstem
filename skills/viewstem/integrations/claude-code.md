# Claude Code installation and discovery

Install Viewstem libraries and this skill separately. Use the identical common
skill folder used for Codex; no Claude-specific copy of its instructions or
library examples is needed. This development candidate has no published install
ref. Claude Code execution is prepared but not yet verified in the initial run.

| Environment | Chosen installation path | Verification |
|---|---|---|
| Claude Code terminal/IDE with repository skill discovery, local or remote | `<app>/.claude/skills/viewstem/` | Start in the app in a fresh session. Confirm `/viewstem` is available and reads that exact SKILL path. |
| A cloud project thread that does not load repository `.claude/skills` | Upload/enable the same complete skill revision through the account's supported skill installation flow | Confirm account skill availability in that cloud session, read a relative reference, and run Node against the target app before claiming support. |

These are installation routes, not separate skill implementations. Each target
session still needs project file access and Node.js 22 or newer. A remote terminal
that uses the repository path is not the same discovery route as an account cloud
thread. Record the actual surface and version rather than classifying by location
alone. Do not count a local terminal check as cloud-thread evidence.

Keep `SKILL.md` and its resources together. Resolve relative links from its actual
installed directory. The common body does not depend on `${CLAUDE_SKILL_DIR}`,
Claude-specific shell interpolation, hooks, subagents, or tool permission names.
Use the existing host permissions for app edits and commands.

For the project path, copy a reviewed folder only into an absent destination.
For updates, preserve the previous complete folder outside skill discovery paths,
then explicitly replace the destination with the selected revision. Restore that
folder for rollback. For account uploads, preserve the old archive, explicitly
replace/disable the old account skill, and verify that the selected revision is
the one loaded. Keep an archive hash/file manifest and the native install identity.
Neither operation changes the consumer app's library versions.

For comparisons, remove/disable the target skill in all active personal, project,
plugin, and synced-account locations for the baseline, without changing unrelated
settings. Use a separate evaluation profile or test account/session rather than
altering a working user's installation. Candidate runs must record the actual
loaded path and revision. Check that a personal or synced copy did not shadow the
project candidate. A new conversation alone does not reset these installations.

Initial comparison preparation uses the same consumer snapshots and prompts as
Codex, with a separately pinned Claude model/settings. Record native skill reads
and command results from the Claude trace. Never label a Codex/subagent result as
a Claude Code run. Authentication and actual host execution remain pending.
