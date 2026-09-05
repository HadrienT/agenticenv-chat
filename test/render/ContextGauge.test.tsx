import { render, screen } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextGauge } from "../../src/webview/views/ContextGauge";
import type { UsageState } from "../../src/webview/store/types";

const usage = (over: Partial<UsageState> = {}): UsageState => ({
  accumulatedCost: 0,
  promptTokens: 0,
  completionTokens: 0,
  contextWindow: 32768,
  tokensPerSec: null,
  ...over,
});

describe("ContextGauge (C13)", () => {
  it("affiche la jauge dès que la fenêtre est connue, sans tour", () => {
    render(
      <ContextGauge
        usage={usage()}
        attachedBytes={4000}
        canCompact
        compacted={false}
        onCompact={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "100");
  });

  it("en zone alerte propose /compact et une nouvelle session", async () => {
    const user = userEventLib.setup();
    const onCompact = vi.fn();
    render(
      <ContextGauge
        usage={usage({ promptTokens: 30000 })}
        attachedBytes={0}
        canCompact
        compacted={false}
        onCompact={onCompact}
        onNewSession={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "/compact" }));
    expect(onCompact).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "new session" })).toBeInTheDocument();
  });

  it("masque le bouton /compact si le bridge ne sait pas compacter", () => {
    render(
      <ContextGauge
        usage={usage({ promptTokens: 30000 })}
        attachedBytes={0}
        canCompact={false}
        compacted
        onCompact={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "/compact" })).toBeNull();
    expect(screen.getByText(/history was compacted/)).toBeInTheDocument();
  });
});
