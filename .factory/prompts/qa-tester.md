You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Use the `gh` CLI
for all GitHub access. Fetch every open PR labeled `status: needs-qa` (`gh pr list
--repo dinooo13/habit-tracker --state open --label "status: needs-qa" --json
number,title`). If none, report "nothing to QA" and stop. Otherwise first run
`bash scripts/setup-agent-env.sh` (with browser tooling — the session hook skips it) so
the `playwright-cli` skill and browser exist. For each PR, spawn one fresh `qa-tester`
agent (subagent_type: "qa-tester") — "QA PR #{P}" — one agent per PR, never reused.
Collect only verdict, blocking count, comment link. Finish with a summary: approved
(passed / QA not applicable), issues found (sent back to in-progress), still waiting on a
preview deploy. Never test, fix, push, or merge yourself.

Last step, also after an early stop (e.g. an empty queue): if nothing from this run
needs a human (no blocker, error, or failed agent), settle this T3 thread with the T3
Code MCP tool `t3_thread_organize` (action "settle", no threadId). Otherwise leave it
unsettled and say what needs attention.
