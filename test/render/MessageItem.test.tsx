import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageItem } from "../../src/webview/views/items/MessageItem";

describe("MessageItem", () => {
  it("bulle utilisateur", () => {
    const { container } = render(
      <MessageItem item={{ kind: "user", id: "ev-0", text: "hello agent" }} />,
    );
    expect(screen.getByText("hello agent")).toBeInTheDocument();
    expect(container.querySelector(".agx-bubble--user")).not.toBeNull();
  });

  it("message assistant : markdown rendu, pouces présents", () => {
    const { container } = render(
      <MessageItem
        item={{
          kind: "assistant",
          id: "ev-1",
          text: "**on it** — see `x`",
          streaming: false,
          revision: 0,
        }}
      />,
    );
    expect(container.querySelector(".agx-msg--assistant")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("on it");
    expect(screen.getByLabelText("Helpful")).toBeInTheDocument();
  });
});
