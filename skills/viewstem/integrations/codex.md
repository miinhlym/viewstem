# Codex installation and discovery

Codex is the current support and release-validation target. Recorded execution
evidence covers the local CLI; other surfaces still require their own checks.
The common skill instructions remain independent of the host.

The library and this skill are installed separately. Install the complete
`viewstem/` folder from one reviewed revision; installing an npm package does
not install this skill. This development candidate has no published install ref.

| Environment | Chosen installation path | Verification |
|---|---|---|
| Codex CLI/IDE with a repository checkout, on a local or remote machine | `<app>/.agents/skills/viewstem/` | Start a fresh session in that app; confirm `viewstem` is listed and its loaded SKILL path is this folder. Explicit CLI/IDE invocation is `$viewstem`. |
| Codex desktop with project file and Node access | The same project folder when that surface discovers repository skills | Select the discovered skill in the host UI. Verify its actual source path, references, and Node access in this session; CLI results alone do not validate this surface. |
| A hosted surface without repository-skill discovery | An explicitly uploaded/installed package supported by that surface, containing this same folder revision | Record that surface's install identity and actual discovery result before claiming support. A local path on another machine is not an installation. |

Resolve references relative to the loaded `SKILL.md` file. Resolve application
packages relative to the target app's manifest. The skill's path and the app's
path need not share a parent directory.

For the project path, copy a reviewed skill folder only when the destination is
absent. If it exists, compare revisions first; do not merge or silently overwrite
it. To update, preserve the previous folder outside any skill discovery directory,
then replace the complete folder with the selected revision. To roll back, restore
that preserved folder. Start a fresh session and confirm the loaded path and file
hashes after either operation. Do not change the app's library version as part of
a skill update.

For a native installer/upload path, select an immutable source revision and use
that host's explicit replace/remove controls. Keep the previous complete archive
and source identity for rollback. Re-run the same discovery and relative-path
checks after replacement. Do not promise an installer supports ref selection
unless its actual version does.

Codex can also discover personal skills; this project's default is project scope
so its version travels with the app. Check for another skill with the same name
before evaluating. A baseline run must have no Viewstem skill installed in any
active discovery location. Keep all unrelated skills and settings fixed between
baseline and candidate; record the loaded candidate path and hash from the trace.

Discovery, explicit invocation, implicit selection, reference reading, and Node
execution are separate checks. Record host version and session type. A local CLI
check does not establish all desktop/cloud installation paths.
