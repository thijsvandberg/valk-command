/**
 * AI confirmation for the "replaced / obsolete area" topic (BRDG-285).
 *
 * The keyword matcher gives a cheap prior; this step asks the workspace agent to
 * judge whether the ticket is genuinely ABOUT a retired area (so it can probably
 * be deprecated) versus merely mentioning it in passing. Splitting the prompt
 * build + response parse out of the scorer keeps them pure and unit-testable
 * (the scorer wires them to the real agent; tests assert on these directly).
 */

export interface ConfirmationInput {
  jiraKey: string;
  title: string;
  description: string | null;
  /** Canonical retired-area terms the matcher flagged. */
  matchedAreas: string[];
}

export interface ConfirmationOutcome {
  /** True when the agent judged the ticket substantively about the retired area. */
  confirmed: boolean;
  /** One-line, human-readable explanation for the rationale. */
  rationale: string;
}

/**
 * Build the skill prompt. WHY a strict, machine-parseable contract: we run this
 * server-side without a human in the loop, so the agent must answer in a fixed
 * shape we can parse deterministically (see parseConfirmation).
 */
export function buildConfirmationPrompt(input: ConfirmationInput): string {
  const areas = input.matchedAreas.join(", ");
  const description = (input.description ?? "").slice(0, 2000);
  return [
    `A backlog ticket may concern a retired/replaced product or tech area: ${areas}.`,
    `Decide whether the ticket is genuinely ABOUT one of these retired areas (so it is`,
    `likely obsolete), or only mentions it incidentally.`,
    ``,
    `Ticket ${input.jiraKey}`,
    `Title: ${input.title}`,
    `Description: ${description || "(none)"}`,
    ``,
    `Respond with EXACTLY two lines and nothing else:`,
    `VERDICT: YES or NO`,
    `RATIONALE: one short sentence (max 140 chars) explaining the verdict.`,
  ].join("\n");
}

/**
 * Parse the agent's two-line answer into a structured outcome. Tolerant of
 * surrounding whitespace/markdown and case. An unparseable verdict is treated as
 * NOT confirmed so an ambiguous answer never promotes a ticket on its own.
 */
export function parseConfirmation(output: string): ConfirmationOutcome {
  const verdictMatch = output.match(/VERDICT:\s*(YES|NO)/i);
  const rationaleMatch = output.match(/RATIONALE:\s*(.+)/i);

  const confirmed = verdictMatch ? verdictMatch[1].toUpperCase() === "YES" : false;
  let rationale = rationaleMatch ? rationaleMatch[1].trim() : "";
  // Strip trailing markdown/quotes and clamp length for a tidy one-liner.
  rationale = rationale.replace(/^["'`*\s]+|["'`*\s]+$/g, "").slice(0, 140);
  if (!rationale) {
    rationale = confirmed
      ? "Confirmed to be about a retired area."
      : "Mention of a retired area appears incidental.";
  }

  return { confirmed, rationale };
}
