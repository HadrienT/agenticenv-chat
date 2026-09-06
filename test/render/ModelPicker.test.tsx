import { render, screen } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "../../src/webview/views/ModelPicker";
import type { ModelView } from "../../src/messages";

const models: ModelView[] = [
  { id: "big", label: "qwen2.5-coder-32b", contextWindow: 32768, current: true },
  { id: "small", label: "qwen2.5-coder-7b", contextWindow: 8192, current: false },
];

describe("ModelPicker (C12 §2)", () => {
  it("n'affiche rien sans liste de modèles", () => {
    const { container } = render(<ModelPicker models={null} disabled={false} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sélectionne un modèle et le remonte", async () => {
    const user = userEventLib.setup();
    const onSelect = vi.fn();
    render(<ModelPicker models={models} disabled={false} onSelect={onSelect} />);
    await user.selectOptions(screen.getByLabelText("model"), "small");
    expect(onSelect).toHaveBeenCalledWith("small");
  });

  it("pendant un rechargement, le sélecteur est désactivé et renvoie vers Components", () => {
    const loading: ModelView[] = [
      { id: "big", label: "big", contextWindow: 32768, current: false },
      { id: "small", label: "small", contextWindow: 8192, current: true, state: "loading" },
    ];
    render(<ModelPicker models={loading} disabled={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText("model")).toBeDisabled();
    expect(screen.getByText(/see Components/)).toBeInTheDocument();
  });

  it("affiche le message brut de llama-server en cas d'échec", () => {
    const errored: ModelView[] = [
      { id: "big", label: "big", contextWindow: 32768, current: true, state: "error", error: "CUDA out of memory" },
    ];
    render(<ModelPicker models={errored} disabled={false} onSelect={vi.fn()} />);
    expect(screen.getByText("CUDA out of memory")).toBeInTheDocument();
  });
});
