import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { McpPicker } from "../../src/webview/views/panels/McpPicker";
import { StartupProgress } from "../../src/webview/views/panels/StartupProgress";

function picker(selected: string[] = []): JSX.Element {
  return (
    <McpPicker
      servers={[
        { name: "kbase", transport: "http", tools: [] },
        { name: "agentmem", transport: "http", tools: [] },
        { name: "cppdev", transport: "stdio", tools: [], unavailable: "needs code_tools" },
      ]}
      selected={selected}
      modes={[]}
      selectedMode={null}
      workspaceFolder="repo"
      disabled={false}
      starting={false}
      startup={null}
      onToggle={vi.fn()}
      onSetAll={vi.fn()}
      onSelectMode={vi.fn()}
      onStart={vi.fn()}
    />
  );
}

describe("écran de démarrage de session", () => {
  it("un serveur indisponible dit pourquoi et ne se coche pas", () => {
    render(picker());
    expect(screen.getByRole("checkbox", { name: /cppdev/ })).toBeDisabled();
    expect(screen.getByText(/needs code_tools/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /kbase/ })).toBeEnabled();
  });

  it("« tout sélectionner » est atteint sans les serveurs indisponibles", () => {
    render(picker(["kbase", "agentmem"]));
    expect(screen.getByRole("checkbox", { name: "Deselect all" })).toBeChecked();
  });

  it("montre les étapes passées, en cours et à venir", () => {
    render(<StartupProgress startup={{ steps: ["A", "B", "C"], current: 1 }} />);
    expect(screen.getByText("✓ A")).toBeInTheDocument();
    expect(screen.getByText("● B")).toBeInTheDocument();
    expect(screen.getByText("○ C")).toBeInTheDocument();
  });
});
