import { useEffect, useRef, useState } from "react";
import type { ContextChip, FileHit, SlashCommand } from "../../../messages";
import type { BudgetStatus, ComposerButton } from "../../store/selectors";
import { BudgetMeter } from "./BudgetMeter";
import { ChipBar } from "./ChipBar";
import { MentionMenu, SlashMenu } from "./Menu";
import { activeToken, parseSlash, stripToken } from "./composerParse";
import { isKnownCommand, mentionOptions, slashMatches } from "./menuOptions";
import { useHistoryNav } from "./useHistoryNav";

const DEBOUNCE_MS = 120;
const MAX_ROWS = 12;

export interface ComposerProps {
  draft: string;
  chips: { chip: ContextChip; auto: boolean }[];
  history: string[];
  commands: SlashCommand[];
  fileSearch: { requestId: string; results: FileHit[] } | null;
  budget: BudgetStatus;
  button: ComposerButton;
  placeholder: string;
  canSend: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onForceNew: () => void;
  onSearchFiles: (query: string, requestId: string) => void;
  onAddChip: (chip: ContextChip) => void;
  onRemoveChip: (index: number, auto: boolean, refKey: string) => void;
  onPickContext: () => void;
  onCommand: (command: SlashCommand, args: string) => void;
}

/**
 * Composer (C03) : chips, `#`-références, `/`-commandes, historique, budget.
 * Textarea 1–12 lignes. `Enter` envoie, `Shift+Enter` newline, `Esc` ferme le
 * menu. Pilotable au clavier.
 */
export function Composer(props: ComposerProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const reqId = useRef(0);
  const hist = useHistoryNav(props.history, props.draft, props.onDraft);

  // caret non suivi (premier rendu, valeur programmatique) ⇒ on suppose la fin.
  const pos = caret === 0 && props.draft.length > 0 ? props.draft.length : Math.min(caret, props.draft.length);
  const token = activeToken(props.draft, pos);
  const tokenQuery = token.kind === "none" ? "" : token.query;

  const slashList = token.kind === "slash" ? slashMatches(token.query, props.commands) : [];
  const fileHits: FileHit[] = props.fileSearch?.results ?? [];
  const mentionList = token.kind === "mention" ? mentionOptions(token.query, fileHits) : [];
  const menuCount = token.kind === "slash" ? slashList.length : mentionList.length;

  useEffect(() => setMenuIndex(0), [token.kind, tokenQuery]);

  useEffect(() => {
    if (token.kind !== "mention" || ["problems", "terminal", "git", "selection"].includes(token.prefix)) {
      return;
    }
    const id = `s${++reqId.current}`;
    const t = setTimeout(() => props.onSearchFiles(token.query, id), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [token.kind, tokenQuery]);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, MAX_ROWS * 18 + 12) + "px";
    }
  }, [props.draft]);

  const commit = (updated: string, newCaret: number): void => {
    props.onDraft(updated);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.selectionStart = el.selectionEnd = newCaret;
        setCaret(newCaret);
        el.focus();
      }
    });
  };

  const pickMention = (chip: ContextChip): void => {
    props.onAddChip(chip);
    if (token.kind === "mention") {
      const { text, caret: c } = stripToken(props.draft, token.start, pos);
      commit(text, c);
    }
  };

  const runCommand = (name: string, args: string): void => {
    const cmd =
      slashMatches("", props.commands).find((c) => c.name === name) ??
      ({ name, description: "", source: "builtin" } as SlashCommand);
    props.onCommand(cmd, args);
    commit("", 0);
  };

  const submit = (): void => {
    const slash = parseSlash(props.draft);
    if (slash && isKnownCommand(slash.command, props.commands)) {
      runCommand(slash.command, slash.args);
      return;
    }
    if (props.canSend && props.draft.trim()) {
      props.onSend();
      hist.reset();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (token.kind !== "none" && menuCount > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => Math.min(i + 1, menuCount - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        ref.current
          ?.closest(".agx-composer")
          ?.querySelector<HTMLElement>(".agx-menu__item--active")
          ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        commit(props.draft.slice(0, pos) + " " + props.draft.slice(pos), pos + 1);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && hist.handle(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div className="agx-composer">
      <ChipBar chips={props.chips} onRemove={props.onRemoveChip} />
      <div className="agx-composer__field">
        {token.kind === "slash" && (
          <SlashMenu matches={slashList} activeIndex={menuIndex} onHover={setMenuIndex} onPick={(c) => runCommand(c.name, "")} />
        )}
        {token.kind === "mention" && (
          <MentionMenu options={mentionList} activeIndex={menuIndex} onHover={setMenuIndex} onPick={(o) => pickMention(o.chip)} />
        )}
        <textarea
          ref={ref}
          className="agx-composer__input"
          placeholder={props.placeholder}
          value={props.draft}
          aria-label="Message the agent"
          rows={1}
          onChange={(e) => {
            props.onDraft(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="agx-composer__foot">
        <button className="agx-icon-btn" aria-label="Add context" title="Add context" onClick={props.onPickContext}>
          ＋
        </button>
        <BudgetMeter status={props.budget} />
        {props.button === "send" ? (
          <button className="agx-btn" disabled={!props.canSend || !props.draft.trim()} onClick={submit}>
            Send
          </button>
        ) : (
          <button
            className="agx-btn agx-btn--danger"
            onClick={props.button === "stop" ? props.onStop : props.onForceNew}
          >
            {props.button === "stop" ? "Stop" : "Force new session"}
          </button>
        )}
      </div>
    </div>
  );
}
