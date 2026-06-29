import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IssueTypeIcon } from "./IssueTypeIcon";

describe("IssueTypeIcon", () => {
  it("renders the subtask glyph distinct from the task glyph", () => {
    // Regression guard: subtask used to reuse the task square (SquareMinus vs
    // CheckSquare, same blue), which made the two issue types read as identical.
    const { container: task } = render(<IssueTypeIcon type="task" />);
    const { container: subtask } = render(<IssueTypeIcon type="subtask" />);

    const taskSvg = task.querySelector("svg");
    const subtaskSvg = subtask.querySelector("svg");

    expect(taskSvg?.getAttribute("class")).toContain("lucide-square-check-big");
    expect(subtaskSvg?.getAttribute("class")).toContain("lucide-corner-down-right");

    // They must not collapse to the same icon.
    expect(subtaskSvg?.getAttribute("class")).not.toContain("lucide-square-check-big");
  });

  it("returns null for an unknown issue type", () => {
    const { container } = render(<IssueTypeIcon type="not-a-real-type" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
