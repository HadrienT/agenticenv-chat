import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const REPO_ROOT = join(__dirname, "..", "..");
export const SRC_DIR = join(REPO_ROOT, "src");

export function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

export function srcFiles(exts: string[] = [".ts", ".tsx"]): string[] {
  return walk(SRC_DIR, exts);
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

export function rel(file: string): string {
  return relative(REPO_ROOT, file);
}
