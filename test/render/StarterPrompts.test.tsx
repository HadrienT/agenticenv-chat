import { fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "../../src/webview/store/dispatch";
import { initialState } from "../../src/webview/store/initialState";
import { reduce } from "../../src/webview/store/reducer";
import type { AppState } from "../../src/webview/store/types";
import { ChatScreen } from "../../src/webview/views/ChatScreen";
import type { ThreadServices } from "../../src/webview/views/threadContext";
import { post } from "../../src/webview/vscodeApi";

vi.mock("../../src/webview/vscodeApi", () => ({ post: vi.fn() }));

const PROMPT = "Review my uncommitted changes";

function chatState(connection: AppState["connection"]["state"]): AppState {
  const base = initialState();
  return {
    ...base,
    connection: { ...base.connection, state: connection },
    phase: { kind: "idle", conversationId: "c1" },
    starters: [PROMPT],
  };
}

function Harness(props: { start: AppState }): JSX.Element {
  const [state, dispatch] = useReducer(reduce, props.start);
  return <ChatScreen state={state} actions={createActions(dispatch)} services={{} as ThreadServices} />;
}

function userMessages(): unknown[] {
  return vi.mocked(post).mock.calls.filter(([m]) => m.type === "userMessage").map(([m]) => m);
}

describe("starter prompts", () => {
  beforeEach(() => vi.mocked(post).mockClear());

  it("un clic envoie le prompt au lieu de seulement remplir le composer", () => {
    render(<Harness start={chatState("open")} />);
    fireEvent.click(screen.getByRole("button", { name: PROMPT }));
    expect(userMessages()).toEqual([{ type: "userMessage", text: PROMPT, context: [] }]);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("hors connexion, le prompt reste dans le composer et n'est pas perdu", () => {
    render(<Harness start={chatState("closed")} />);
    fireEvent.click(screen.getByRole("button", { name: PROMPT }));
    expect(userMessages()).toEqual([]);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(PROMPT);
  });
});
