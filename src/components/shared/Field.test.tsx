import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

describe("Field", () => {
  it("renders the label and wraps the control in a <label> by default", () => {
    const { container } = render(
      <Field label="Epic title">
        <TextInput placeholder="Title" />
      </Field>,
    );
    expect(screen.getByText("Epic title")).toBeInTheDocument();
    expect(container.querySelector("label")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Title")).toBeInTheDocument();
  });

  it("renders a hint suffix muted next to the label", () => {
    render(
      <Field label="Description" hint="(optional)">
        <TextInput />
      </Field>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("shows the error text with role=alert in the error color", () => {
    render(
      <Field label="Name" error="Name is required">
        <TextInput />
      </Field>,
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Name is required");
    expect(error.className).toContain("--color-status-error");
  });

  it("renders no error element when error is absent", () => {
    render(
      <Field label="Name">
        <TextInput />
      </Field>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mutes the label row when disabled", () => {
    render(
      <Field label="Name" disabled>
        <TextInput disabled />
      </Field>,
    );
    const labelRow = screen.getByText("Name").closest("span");
    expect(labelRow?.className).toContain("opacity-50");
  });

  it("uses a div container when as='div' is set", () => {
    const { container } = render(
      <Field as="div" label="Start date">
        <button type="button">Pick a date</button>
      </Field>,
    );
    expect(container.querySelector("label")).toBeNull();
    expect(screen.getByText("Start date")).toBeInTheDocument();
  });

  it("uses a div container when labelEnd is interactive content", () => {
    const { container } = render(
      <Field label="Sprint goal" labelEnd={<button type="button">Suggest with AI</button>}>
        <TextInput />
      </Field>,
    );
    expect(container.querySelector("label")).toBeNull();
    expect(screen.getByRole("button", { name: "Suggest with AI" })).toBeInTheDocument();
  });
});
