import { describe, expect, it } from "vitest";
import { conversationPicks } from "../../src/conversationPick";

const item = {
  conversation_id: "a",
  updated_at: "2026-10-31T10:00:00+00:00",
  turns: 3,
  active: false,
};

describe("conversationPicks (WP08e)", () => {
  it("nomme une conversation sans titre et donne son nombre de tours", () => {
    const [pick] = conversationPicks([item]);
    expect(pick.label).toBe("(untitled)");
    expect(pick.description).toContain("3 turns");
  });

  it("marque la conversation active", () => {
    const [pick] = conversationPicks([{ ...item, title: "Fix the build", active: true }]);
    expect(pick.label).toBe("$(check) Fix the build");
  });
});
