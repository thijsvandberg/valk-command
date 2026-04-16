// TipTap-compatible HTML templates for slash command insertions.
// Using HTML directly to avoid markdown-to-HTML conversion ambiguity.

export const AC_TEMPLATE_HTML =
  "<ul>" +
  "<li><p>[ ] Criterion 1</p></li>" +
  "<li><p>[ ] Criterion 2</p></li>" +
  "<li><p>[ ] Criterion 3</p></li>" +
  "</ul>";

export const STORY_TEMPLATE_HTML =
  "<h2>Description</h2>" +
  "<p>...</p>" +
  "<h2>Acceptance Criteria</h2>" +
  "<ul>" +
  "<li><p>[ ] Criterion 1</p></li>" +
  "<li><p>[ ] Criterion 2</p></li>" +
  "</ul>" +
  "<h2>Technical Notes</h2>" +
  "<p>...</p>" +
  "<h2>Out of Scope</h2>" +
  "<p>...</p>";

export const BUG_TEMPLATE_HTML =
  "<h2>Steps to Reproduce</h2>" +
  "<ol>" +
  "<li><p>Step one</p></li>" +
  "<li><p>Step two</p></li>" +
  "<li><p>Step three</p></li>" +
  "</ol>" +
  "<h2>Expected Behavior</h2>" +
  "<p>...</p>" +
  "<h2>Actual Behavior</h2>" +
  "<p>...</p>" +
  "<h2>Environment</h2>" +
  "<p>...</p>";

export const TASK_TEMPLATE_HTML =
  "<h2>Objective</h2>" +
  "<p>...</p>" +
  "<h2>Steps</h2>" +
  "<ul>" +
  "<li><p>[ ] Step 1</p></li>" +
  "<li><p>[ ] Step 2</p></li>" +
  "<li><p>[ ] Step 3</p></li>" +
  "</ul>" +
  "<h2>Definition of Done</h2>" +
  "<ul>" +
  "<li><p>[ ] ...</p></li>" +
  "</ul>";
