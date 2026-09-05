import type { WebviewToHost } from "../protocol";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscodeApi: VsCodeApi = acquireVsCodeApi();

export function post(message: WebviewToHost): void {
  vscodeApi.postMessage(message);
}
