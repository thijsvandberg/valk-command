# AO Pipeline Patterns

Recurring patterns observed across monitoring sessions. Updated by `/ao` skill runs.

## Failure modes

### Zombie sessions (confirmed recurring)
Sessions go "ready" after completing initial work and stop responding to prompts. Seen consistently across sessions. Root cause: `ao send` with short sleep + `--no-wait` fails to deliver prompts reliably. Workaround: `sleep 20` + background subshell + `--timeout 60`. Auto-kill after 3 min idle addresses symptom.

### Direct push to dev (seen 2026-03-29)
Agent (vc-117) pushed a fix commit directly to dev, bypassing the PR process. Commit `3bc398c` appeared on both dev HEAD and the agent's feature branch. This also had a side effect: the commit removed trigger file writing from metadata-updater.sh, disabling the event-driven pipeline. Agents must be explicitly told: never push to dev directly.

## Token optimization
<!-- Observations about model selection and token efficiency -->

## Process improvements
<!-- Changes applied to pipeline config, nudge script, or agent rules -->
