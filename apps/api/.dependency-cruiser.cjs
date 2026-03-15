/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Circular dependencies make code harder to test, reason about, and maintain.",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-cross-module-imports",
      comment:
        "A module may not import from a sibling module. " +
        "The app module is excluded as it is the orchestrator.",
      severity: "error",
      from: {
        // Captures the module name as $1; excludes app (orchestrator)
        path: "^src/module/(?!app/)([^/]+)/.+",
      },
      to: {
        path: "^src/module/([^/]+)/.+",
        // $1 is substituted per-file with the source module name.
        // This fires when the destination module != source module.
        pathNot: "^src/module/$1/.+",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules|__tests__|migrations|\\.spec\\.ts$|\\.int-spec\\.ts$|\\.e2e-spec\\.ts$",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.app.json",
    },
  },
};
