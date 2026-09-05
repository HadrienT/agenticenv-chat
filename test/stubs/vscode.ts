/**
 * Bouchon minimal du module `vscode` pour les tests unitaires en Node. Aliasé
 * dans `vitest.config.ts`. Il n'implémente que ce dont `src/paths.ts`,
 * `src/logging.ts` et `src/messages.ts` ont besoin.
 */

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query = "",
    public readonly fragment = "",
  ) {}

  static file(fsPath: string): Uri {
    let p = fsPath.replace(/\\/g, "/");
    if (!p.startsWith("/")) {
      p = "/" + p;
    }
    return new Uri("file", "", p);
  }

  static parse(value: string): Uri {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/]*)(\/.*)?$/.exec(value);
    if (!m) {
      return Uri.file(value);
    }
    return new Uri(m[1], m[2] ?? "", m[3] ?? "/");
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const parts = [base.path.replace(/\/+$/, ""), ...segments.map((s) => s.replace(/^\/+/, ""))];
    return new Uri(base.scheme, base.authority, parts.join("/"), base.query, base.fragment);
  }

  static from(components: {
    scheme: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    return new Uri(
      components.scheme,
      components.authority ?? "",
      components.path ?? "",
      components.query ?? "",
      components.fragment ?? "",
    );
  }

  toJSON(): unknown {
    return {
      scheme: this.scheme,
      authority: this.authority,
      path: this.path,
      query: this.query,
      fragment: this.fragment,
      fsPath: this.fsPath,
    };
  }

  get fsPath(): string {
    return this.path;
  }

  with(change: { scheme?: string; authority?: string; path?: string }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      this.query,
      this.fragment,
    );
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

export interface OutputChannel {
  name: string;
  appendLine(line: string): void;
  append(text: string): void;
  replace(text: string): void;
  clear(): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export const window = {
  createOutputChannel(name: string): OutputChannel {
    return {
      name,
      appendLine: () => undefined,
      append: () => undefined,
      replace: () => undefined,
      clear: () => undefined,
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    };
  },
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  getConfiguration() {
    return { get: <T>(_key: string, fallback: T): T => fallback };
  },
  onDidChangeConfiguration() {
    return { dispose: () => undefined };
  },
};

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
  executeCommand: () => Promise.resolve(undefined),
};
