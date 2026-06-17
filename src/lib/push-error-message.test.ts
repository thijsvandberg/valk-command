import { describe, it, expect } from "vitest";
import { mapPushErrorMessage } from "./push-error-message";

describe("mapPushErrorMessage", () => {
  it("maps the Jira content-limit code to friendly copy", () => {
    expect(
      mapPushErrorMessage("Jira 400: description: CONTENT_LIMIT_EXCEEDED"),
    ).toBe("This description is too large for Jira. Trim it and try again.");
  });

  it("maps the human content-limit phrasing too", () => {
    expect(
      mapPushErrorMessage("Jira 400: description: The content exceeds the maximum allowed length"),
    ).toBe("This description is too large for Jira. Trim it and try again.");
  });

  it("falls back to the raw detail for unknown reasons", () => {
    expect(mapPushErrorMessage("Jira 403: you are not a project admin")).toBe(
      "Jira 403: you are not a project admin",
    );
  });

  it("falls back to a generic message when no detail is given", () => {
    expect(mapPushErrorMessage(undefined)).toBe("Failed to push to Jira");
    expect(mapPushErrorMessage(null)).toBe("Failed to push to Jira");
    expect(mapPushErrorMessage("")).toBe("Failed to push to Jira");
  });
});
