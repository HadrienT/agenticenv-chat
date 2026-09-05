import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: "info",
};

const extensionConfig = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  // vscode is provided by the host; ws ships as a runtime dependency (Node side).
  external: ["vscode"],
};

const webviewConfig = {
  ...common,
  entryPoints: ["src/webview/index.tsx"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  // The webview runs in a browser context; React is bundled in.
  define: { "process.env.NODE_ENV": production ? '"production"' : '"development"' },
};

if (watch) {
  const ctxExt = await esbuild.context(extensionConfig);
  const ctxWeb = await esbuild.context(webviewConfig);
  await Promise.all([ctxExt.watch(), ctxWeb.watch()]);
  console.log("watching...");
} else {
  await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
}
