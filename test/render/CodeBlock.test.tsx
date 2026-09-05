import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeBlock, type CodeActions } from "../../src/webview/views/CodeBlock";

function actions(): CodeActions {
  return { copy: vi.fn(), insert: vi.fn(), createFile: vi.fn(), runInTerminal: vi.fn() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CodeBlock — barre d'outils (C02 §3)", () => {
  it("Copy émet copy() et affiche « Copied! » puis revient à « Copy »", () => {
    vi.useFakeTimers();
    const a = actions();
    render(<CodeBlock code="int x;" lang="cpp" open={false} editorAvailable actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(a.copy).toHaveBeenCalledWith("int x;");
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("Insert est grisé sans éditeur actif", () => {
    render(<CodeBlock code="x" lang="ts" open={false} editorAvailable={false} actions={actions()} />);
    expect(screen.getByRole("button", { name: "Insert" })).toBeDisabled();
  });

  it("New file émet createFile avec un nom d'après le langage", () => {
    const a = actions();
    render(<CodeBlock code="print(1)" lang="python" open={false} editorAvailable actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(a.createFile).toHaveBeenCalledWith("snippet.py", "print(1)");
  });

  it("Run n'apparaît que pour bash/sh et passe la commande", () => {
    const a = actions();
    const { rerender } = render(
      <CodeBlock code="ls -la" lang="bash" open={false} editorAvailable actions={a} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(a.runInTerminal).toHaveBeenCalledWith("ls -la");

    rerender(<CodeBlock code="x" lang="python" open={false} editorAvailable actions={a} />);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("colore le C++ (spans hljs)", () => {
    const { container } = render(
      <CodeBlock code="int main() { return 0; }" lang="cpp" open={false} editorAvailable actions={actions()} />,
    );
    expect(container.querySelector("code.hljs [class^='hljs-']")).not.toBeNull();
  });
});
