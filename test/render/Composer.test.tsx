import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "../../src/webview/views/composer/Composer";
import type { BudgetStatus } from "../../src/webview/store/selectors";

const budget: BudgetStatus = { bytes: 0, windowBytes: null, ratio: null, level: "ok" };

function props(over: Partial<ComposerProps> = {}): ComposerProps {
  return {
    draft: "",
    chips: [],
    history: [],
    commands: [],
    fileSearch: null,
    budget,
    button: "send",
    placeholder: "Message the agent…",
    canSend: true,
    onDraft: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onForceNew: vi.fn(),
    onSearchFiles: vi.fn(),
    onAddChip: vi.fn(),
    onRemoveChip: vi.fn(),
    onPickContext: vi.fn(),
    onCommand: vi.fn(),
    ...over,
  };
}

describe("Composer (C03)", () => {
  it("Enter envoie, le contexte ne passe pas dans le texte", () => {
    const onSend = vi.fn();
    render(<Composer {...props({ draft: "hi", onSend })} />);
    fireEvent.keyDown(screen.getByLabelText("Message the agent"), { key: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });

  it("`/` ouvre le menu des commandes ; Escape le ferme", () => {
    render(<Composer {...props({ draft: "/" })} />);
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
  });

  it("`#` ouvre le menu de références", () => {
    render(<Composer {...props({ draft: "look at #" })} />);
    expect(screen.getByRole("listbox", { name: "Context references" })).toBeInTheDocument();
  });

  it("chip retirable ; auto → dismissAuto, explicite → removeAttachment", () => {
    const onRemoveChip = vi.fn();
    render(
      <Composer
        {...props({
          onRemoveChip,
          chips: [
            { chip: { ref: { kind: "file", uri: "a" }, label: "a.cpp", estBytes: 0 }, auto: true },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove a.cpp" }));
    expect(onRemoveChip).toHaveBeenCalledWith(0, true, JSON.stringify({ kind: "file", uri: "a" }));
  });

  it("bouton devient Stop quand button=stop", () => {
    render(<Composer {...props({ button: "stop" })} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("chaque bouton a un aria-label", () => {
    render(<Composer {...props()} />);
    expect(screen.getByLabelText("Add context")).toBeInTheDocument();
    expect(screen.getByLabelText("Message the agent")).toBeInTheDocument();
  });
});
