import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { fileRefsToHtml } from "./fileLinks";
import { escapeHtml } from "./highlight";

/**
 * Rendu markdown **assaini** (C02 §4). Le contenu vient d'un LLM qui a pu lire du
 * HTML hostile dans un fichier du dépôt.
 *
 * Double barrière : `markdown-it` avec `html: false` (le HTML brut devient du
 * texte échappé) **puis** DOMPurify avec une **allowlist** de balises et
 * d'attributs (jamais une denylist). Aucune relâche de CSP (00-PRIMER §5) : si
 * une lib de rendu exige `unsafe-eval`, on change de lib.
 *
 * Ce module est pur : aucun état, aucun effet (test de discipline `render-purity`).
 */

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "ul", "ol", "li", "code", "pre", "table", "thead", "tbody", "tr", "th", "td",
  "blockquote", "a", "img", "strong", "em", "del", "hr", "br", "span",
];
const ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "data-agx-file", "data-agx-line"];
const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|#)/i;

/**
 * Rend un fragment de **prose** markdown (les blocs de code de 1er niveau sont
 * extraits en amont par `splitBlocks`). Si `sandboxRoot` est fourni, les
 * références `path:line` deviennent des liens (items 27, 44) — l'ouverture réelle
 * est déléguée à l'hôte au clic.
 */
export function renderProse(text: string, sandboxRoot: string | null = null): string {
  const clean = sanitize(md.render(text));
  return sandboxRoot ? linkifyFileRefs(clean, sandboxRoot) : clean;
}

/** Rend un fragment inline (pas de `<p>` autour) — pensées, libellés. */
export function renderInline(text: string): string {
  return sanitize(md.renderInline(text));
}

function sanitize(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });
  return typeof clean === "string" ? clean : String(clean);
}

/** Ferme virtuellement un bloc de code non terminé (C02 §5, streaming). */
export function closeOpenFence(text: string): string {
  const fences = text.match(/^(?:```|~~~)/gm);
  if (fences && fences.length % 2 === 1) {
    return text + (text.endsWith("\n") ? "" : "\n") + "```";
  }
  return text;
}

/**
 * Post-traitement pur : dans le HTML **déjà assaini** (donc bien formé, sans
 * balise utilisateur), remplace les références de fichiers par des liens, mais
 * uniquement dans les zones de texte hors `<a>`, `<code>` et `<pre>`.
 */
export function linkifyFileRefs(html: string, sandboxRoot: string): string {
  const parts = html.split(/(<[^>]+>)/);
  let skipDepth = 0;
  return parts
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(a|code|pre)[\s>]/i.test(part)) {
          skipDepth++;
        } else if (/^<\/(a|code|pre)>/i.test(part) && skipDepth > 0) {
          skipDepth--;
        }
        return part;
      }
      if (skipDepth > 0 || !part) {
        return part;
      }
      return fileRefsToHtml(decodeEntities(part), sandboxRoot, escapeHtml);
    })
    .join("");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
