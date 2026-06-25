Read the production logs (logs/prod-*.log, the :3101 server), assess them, and surface the points that matter most for a Product Owner. Report in Dutch, understandable for a technical PO.

## How to run

1. Produce the structured digest (this does the parsing so you focus on judgment):

   ```
   python3 tools/scripts/prod-log-digest.py
   ```

   Useful variants:
   - `python3 tools/scripts/prod-log-digest.py --files 3` — merge the newest 3 logs (a wider window; each `npm run start` makes a new file).
   - `python3 tools/scripts/prod-log-digest.py logs/prod-YYYYMMDD-HHMMSS.log` — a specific run.
   - `python3 tools/scripts/prod-log-digest.py --slow-ms 800` — raise the "slow access" flag threshold.

2. Read the digest. If a finding needs context, open the cited code or grep the raw log line — do not guess.

## How to judge (separate signal from noise)

Filter out benign noise — do NOT report these as problems:
- A burst of `[client] Failed to fetch` where each endpoint appears ~1x within a few seconds: that is a **server restart / network blip** with a tab open (the client-error sink correctly capturing it), not a bug. Cross-check the timestamps against a restart (a `[db] ready` line nearby).
- Slow-query lines only marginally over the 100ms threshold (e.g. single 101-140ms detail fetches).
- Expected client aborts (ECONNRESET / "aborted" / "failed to pipe response") logged at WARN — these are clients going away mid-response.

Treat as real signal — these deserve attention:
- Any **non-client ERROR** line, any **crash marker** (uncaughtException / unhandledRejection).
- **Recurring** slow endpoints/queries with a high count AND high avg/max (a pattern, not a one-off).
- **Integration/system warnings** ([agent-fetch], [bitbucket], [jira-client], [db], [config], [middleware]) — these point at a real upstream/config problem.
- Non-200 access lines.

## Output (in Dutch, for a technical PO)

Give a short, ranked assessment — "de beste punten eruit":
1. **Gezondheid in één zin** (alles rustig, of zijn er echte fouten?).
2. **Wat verdient aandacht**, gerangschikt op impact (niet op implementatiedetail): per punt wat het is, hoe vaak/hoe erg, en waarom het ertoe doet. Leg trade-offs uit in termen van impact.
3. **Ticket-suggesties**: welke punten zijn een ticket waard. BEFORE proposing one, scan `docs/user-stories/` AND `docs/user-stories/completed/` for an existing ticket that already covers it (e.g. `/api/tickets` slowness is already BRDG-411) and say "al gedekt door BRDG-XXX" instead of duplicating.
4. Explicitly note what you filtered as benign noise, so it is clear nothing was hidden.

## Rules

- Do NOT create tickets or change code from this command — assess and propose only. Offer to draft a ticket if the PO wants one (use the next free BRDG number; ask the PO to confirm it).
- Be honest about severity; never invent problems to look thorough. "Logs zien er gezond uit" is a valid, valuable outcome.
- Never quote secrets/tokens from the logs (the loggers already redact, but stay alert).
