import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../../src/webview/render/Markdown";
import { closeOpenFence, renderProse } from "../../src/webview/render/markdownRender";

describe("Markdown — assainissement (C02 §4)", () => {
  const XSS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "<iframe src='data:text/html,<script>alert(1)</script>'></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>",
  ];

  for (const vector of XSS) {
    it(`neutralise: ${vector.slice(0, 30)}`, () => {
      const html = renderProse(vector);
      // Le HTML brut du LLM est échappé, jamais réinjecté comme balise active.
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/<iframe\b/i);
      expect(html).not.toMatch(/<img\b/i);
      // Rendu dans un vrai DOM : rien d'exécutable n'y survit (contrôle faisant foi).
      const el = document.createElement("div");
      el.innerHTML = html;
      expect(el.querySelector("script, iframe, img, [onerror], [onload], [onclick]")).toBeNull();
      expect(
        Array.from(el.querySelectorAll("a")).some((a) =>
          (a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:"),
        ),
      ).toBe(false);
    });
  }

  it("rend titres, listes, table, gras/emphase", () => {
    const html = renderProse(
      "# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n**bold** _it_",
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
  });

  it("garde les liens http et les rend", () => {
    expect(renderProse("[site](https://example.com)")).toContain('href="https://example.com"');
  });
});

describe("closeOpenFence — markdown incomplet (C02 §5)", () => {
  const doc = "Intro\n\n```cpp\nint main() {\n  return 0;\n}\n```\n\nOutro paragraph here.";

  it("les 10 troncatures d'un même document ne cassent pas le rendu", () => {
    for (let cut = 1; cut <= doc.length; cut += Math.ceil(doc.length / 10)) {
      const partial = doc.slice(0, cut);
      const fixed = closeOpenFence(partial);
      expect(() => renderProse(fixed)).not.toThrow();
      // jamais de ``` littéral orphelin dans la sortie
      expect(renderProse(fixed)).not.toContain("```");
    }
  });

  it("ferme un bloc de code non terminé", () => {
    expect(closeOpenFence("```cpp\nint x;").endsWith("```")).toBe(true);
    expect(closeOpenFence("```cpp\nint x;\n```")).toBe("```cpp\nint x;\n```");
  });
});

describe("Markdown — liens de fichiers", () => {
  it("chemin sous le montage ⇒ lien cliquable ; clic ⇒ onOpenFile", () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <Markdown
        text="see /workspace/project/src/black.cpp:42 for details"
        sandboxRoot="/workspace/project"
        onOpenFile={onOpenFile}
      />,
    );
    const link = container.querySelector("a.agx-filelink");
    expect(link).not.toBeNull();
    (link as HTMLElement).click();
    expect(onOpenFile).toHaveBeenCalledWith("/workspace/project/src/black.cpp", 42);
  });

  it("sans racine connue ⇒ texte, pas de lien", () => {
    const { container } = render(
      <Markdown text="see src/black.cpp:42" sandboxRoot="" onOpenFile={vi.fn()} />,
    );
    expect(container.querySelector("a.agx-filelink")).toBeNull();
  });
});
