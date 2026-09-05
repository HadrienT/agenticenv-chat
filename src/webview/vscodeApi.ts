import type { WebviewToHost } from "../messages";
import type { PersistedState } from "./store/persist";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// `acquireVsCodeApi` ne peut être appelée qu'une fois par chargement de webview.
const vscodeApi: VsCodeApi = acquireVsCodeApi();

export function post(message: WebviewToHost): void {
  vscodeApi.postMessage(message);
}

export function loadPersisted(): unknown {
  return vscodeApi.getState();
}

export function savePersisted(state: PersistedState): void {
  vscodeApi.setState(state);
}
