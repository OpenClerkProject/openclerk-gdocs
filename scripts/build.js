const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const watch = process.argv.includes("--watch");

// Apps Script's V8 runtime has no ESM/CommonJS module loader at runtime, and no bundler --
// every function google.script.run, a menu item, or a trigger needs to call must exist as a
// plain top-level global. esbuild's IIFE output keeps everything inside a closure by default
// (that's the point, for a browser bundle), so we ask it to assign its module exports to a
// global name, then explicitly copy the specific entry points Apps Script needs to call onto
// `globalThis` in a footer. Top-level `const`/`let` bindings do NOT become script-global
// functions the way `function foo() {}` declarations do -- only an explicit globalThis.foo =
// assignment works reliably for google.script.run / onOpen / menu callbacks.
const ENTRY_POINTS = [
  "onOpen",
  "showSidebar",
  "getProviderList",
  "getBluebookEditionList",
  "runOnlineLookup",
  "runBluebookCheck",
  "goToCitationInDocument",
];

const footer = ENTRY_POINTS.map((name) => `globalThis.${name} = __openclerk.${name};`).join("\n");

async function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const options = {
    entryPoints: [path.join(ROOT, "src/server/main.ts")],
    bundle: true,
    outfile: path.join(OUT_DIR, "Code.js"),
    format: "iife",
    globalName: "__openclerk",
    target: "es2019",
    platform: "node",
    footer: { js: footer },
    logLevel: "info",
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(options);
  }

  fs.copyFileSync(path.join(ROOT, "appsscript.json"), path.join(OUT_DIR, "appsscript.json"));
  fs.copyFileSync(path.join(ROOT, "src/ui/sidebar.html"), path.join(OUT_DIR, "sidebar.html"));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
