/**
 * Conversion glob → RegExp, sous-ensemble (`*`, `**`, `?`). Pur, sans imports —
 * partagé par `context/ignore.ts` et `permissions/policy.ts`. Construit
 * caractère par caractère pour éviter les pièges d'échappement (et les faux
 * positifs `no-control-regex` des astuces `replace`).
 */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      out += "(?:.*/)?";
      i += 2;
    } else if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp("^" + out + "$");
}

/** `true` si `path` (ou son basename) matche l'un des globs. */
export function matchesAnyGlob(path: string, globs: string[]): boolean {
  const base = path.split(/[\\/]/).pop() ?? path;
  return globs.some((g) => {
    const re = globToRegExp(g);
    return re.test(path) || re.test(base);
  });
}
