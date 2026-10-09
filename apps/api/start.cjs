// Production entry for the API (docs/56 §2). `pnpm --filter @cineforge/api build`
// compiles the API and the workspace packages it imports to CommonJS under
// dist/ (tsc, so Nest's decorator metadata is emitted). Here, workspace
// imports (@cineforge/<pkg>) resolve to that compiled output, and a compiled
// package's own dependencies resolve from that package's folder in the repo.
const Module = require("node:module");
const path = require("node:path");

const dist = path.join(__dirname, "dist");
const repo = path.resolve(__dirname, "..", "..");
const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  const ws = /^@cineforge\/([a-z-]+)$/.exec(request);
  if (ws) return original.call(this, path.join(dist, "packages", ws[1], "src", "index.js"), parent, ...rest);
  try {
    return original.call(this, request, parent, ...rest);
  } catch (e) {
    const from = parent && parent.filename && path.relative(dist, parent.filename).split(path.sep);
    if (!from || from[0] === ".." || request.startsWith(".")) throw e;
    // dist/<apps|packages>/<name>/… → the source package's node_modules
    return require.resolve(request, { paths: [path.join(repo, from[0], from[1])] });
  }
};
require(path.join(dist, "apps", "api", "src", "main.js"));
