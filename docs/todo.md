# Backlog

- Test-doc: late-result-after-not-needed race. `handleNotNeeded` (useTestDocReview) cancels an in-flight generation fire-and-forget; a result that lands in the cancel window still reaches `handleTaskResult` and writes a draft over the fresh not-needed marker. Rare, self-healing on the next review; decide whether to gate the result handler on the entry's not-needed status. (Found during BRDG-470 verification, 2026-07-04.)
