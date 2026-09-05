import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Diff } from "../../src/webview/views/Diff";

const UNIFIED = `--- a/x.cpp
+++ b/x.cpp
@@ -1,2 +1,3 @@
 int main() {
-  return 0;
+  int x = 1;
+  return x;
 }
`;

describe("Diff (items 41, 122, C06 §4)", () => {
  it("affiche les compteurs +/- mesurés", () => {
    render(<Diff unified={UNIFIED} measured />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("bouton « revert hunk » émet le header du hunk", () => {
    const onRevertHunk = vi.fn();
    render(<Diff unified={UNIFIED} measured onRevertHunk={onRevertHunk} />);
    fireEvent.click(screen.getByRole("button", { name: "revert hunk" }));
    expect(onRevertHunk).toHaveBeenCalledWith(expect.stringContaining("@@ -1,2 +1,3 @@"));
  });

  it("replie au-delà de 40 lignes", () => {
    const big =
      "--- a/x\n+++ b/x\n@@ -1,50 +1,50 @@\n" +
      Array.from({ length: 50 }, (_, i) => `-line ${i}\n+LINE ${i}`).join("\n");
    render(<Diff unified={big} measured />);
    expect(screen.getByRole("button", { name: /show \d+ lines/ })).toBeInTheDocument();
  });

  it("accepte aussi old/new pour un aperçu", () => {
    render(<Diff oldText={"a\nb"} newText={"a\nB\nc"} measured={false} />);
    expect(screen.getByText("(est.)")).toBeInTheDocument();
  });
});
