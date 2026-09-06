import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhaseAnnouncer } from "../../src/webview/views/PhaseAnnouncer";
import type { SessionPhase } from "../../src/webview/store/types";

describe("PhaseAnnouncer (C11 §6)", () => {
  it("annonce le travail en cours en `polite`", () => {
    const phase: SessionPhase = { kind: "running", conversationId: "c", turnId: "t", startedAt: 0 };
    render(<PhaseAnnouncer phase={phase} />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("The agent is working.");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("l'attente d'approbation est `assertive`", () => {
    const phase: SessionPhase = { kind: "awaiting", conversationId: "c", turnId: "t", pending: null };
    render(<PhaseAnnouncer phase={phase} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "assertive");
  });
});
