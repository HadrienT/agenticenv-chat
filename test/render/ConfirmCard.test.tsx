import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmCard } from "../../src/webview/views/ConfirmCard";
import type { PendingActionView } from "../../src/messages";

const cmd: PendingActionView = {
  actionId: "a1",
  kind: "command",
  summary: "rm -rf build",
  command: "rm -rf build && cmake -B build",
  cwd: "/workspace/project",
  warnings: [{ pattern: "x", message: "recursive delete" }],
  blind: false,
};

describe("ConfirmCard (C07 §1)", () => {
  it("montre la commande exacte, le cwd et l'avertissement destructif", () => {
    render(<ConfirmCard pending={cmd} onAnswer={vi.fn()} />);
    expect(screen.getByText(/rm -rf build && cmake -B build/)).toBeInTheDocument();
    expect(screen.getByText(/in \/workspace\/project/)).toBeInTheDocument();
    expect(screen.getByText(/recursive delete/)).toBeInTheDocument();
  });

  it("le focus initial est sur Reject", () => {
    render(<ConfirmCard pending={cmd} onAnswer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reject" })).toHaveFocus();
  });

  it("« Edit… » ouvre un champ ; la commande éditée repart telle quelle", () => {
    const onAnswer = vi.fn();
    render(<ConfirmCard pending={cmd} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit…" }));
    const box = screen.getByLabelText("Edit command") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "echo safe" } });
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, editedCommand: "echo safe" });
  });

  it("« Allow always » demande une portée (jamais global)", () => {
    const onAnswer = vi.fn();
    render(<ConfirmCard pending={cmd} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow always…" }));
    fireEvent.click(screen.getByRole("button", { name: "this folder" }));
    expect(onAnswer).toHaveBeenCalledWith({ accept: true, remember: "workspace" });
  });

  it("bridge v1 sans charge utile ⇒ aveu honnête, pas de fausse description", () => {
    render(<ConfirmCard pending={null} onAnswer={vi.fn()} />);
    expect(screen.getByText(/did not say which action/)).toBeInTheDocument();
  });
});
