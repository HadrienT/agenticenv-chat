import { render, screen } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentHealth } from "../../src/messages";
import { Health } from "../../src/webview/views/panels/Health";

const components: ComponentHealth[] = [
  { id: "bridge", label: "openhands-bridge", status: "up", detail: "127.0.0.1:8300", actions: [] },
  { id: "llama-server", label: "llama-server", status: "degraded", detail: "loading", actions: ["restart"] },
];

/** Enveloppe : `Health` est désormais contrôlé par le store (C14). */
function Harness(props: { components: ComponentHealth[]; onAction?: (c: string, a: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Health
      components={props.components}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      onRefresh={vi.fn()}
      onAction={(c, a) => props.onAction?.(c, a)}
    />
  );
}

describe("Health panel", () => {
  it("résume l'état global et n'affiche les lignes qu'une fois déplié", async () => {
    const user = userEventLib.setup();
    render(<Harness components={components} />);

    expect(screen.getByText(/1 need attention/)).toBeInTheDocument();
    expect(screen.queryByText("openhands-bridge")).toBeNull();

    await user.click(screen.getByRole("button", { name: /components/ }));
    expect(screen.getByText("openhands-bridge")).toBeInTheDocument();
    expect(screen.getByText("llama-server")).toBeInTheDocument();
  });

  it("déclenche l'action sur le bon composant", async () => {
    const user = userEventLib.setup();
    const onAction = vi.fn();
    render(<Harness components={components} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /components/ }));
    await user.click(screen.getByRole("button", { name: "restart" }));
    expect(onAction).toHaveBeenCalledWith("llama-server", "restart");
  });

  it("rien à afficher si aucun composant", () => {
    const { container } = render(<Harness components={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
