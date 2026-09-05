import { render, screen } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentHealth } from "../../src/messages";
import { Health } from "../../src/webview/views/panels/Health";

const components: ComponentHealth[] = [
  { id: "bridge", label: "openhands-bridge", status: "up", detail: "127.0.0.1:8300", actions: [] },
  { id: "llama-server", label: "llama-server", status: "degraded", detail: "loading", actions: ["restart"] },
];

describe("Health panel", () => {
  it("résume l'état global et n'affiche les lignes qu'une fois déplié", async () => {
    const user = userEventLib.setup();
    render(<Health components={components} onAction={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText(/1 need attention/)).toBeInTheDocument();
    expect(screen.queryByText("openhands-bridge")).toBeNull();

    await user.click(screen.getByRole("button", { name: /components/ }));
    expect(screen.getByText("openhands-bridge")).toBeInTheDocument();
    expect(screen.getByText("llama-server")).toBeInTheDocument();
  });

  it("déclenche l'action sur le bon composant", async () => {
    const user = userEventLib.setup();
    const onAction = vi.fn();
    render(<Health components={components} onAction={onAction} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /components/ }));
    await user.click(screen.getByRole("button", { name: "restart" }));
    expect(onAction).toHaveBeenCalledWith("llama-server", "restart");
  });

  it("rien à afficher si aucun composant", () => {
    const { container } = render(<Health components={[]} onAction={vi.fn()} onRefresh={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
