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
        "A domain module may only import from itself or from module/shared/*. " +
        "The app module is the orchestrator and is excluded as a source. " +
        "module/shared/* is excluded as a source because its outbound rules " +
        "are enforced separately by no-shared-to-domain.",
      severity: "error",
      from: {
        // Captures the module name as $1; excludes app (orchestrator) and shared (governed below)
        path: "^src/module/(?!app/|shared/)([^/]+)/.+",
      },
      to: {
        path: "^src/module/([^/]+)/.+",
        // $1 is substituted per-file with the source module name.
        // Allowed destinations: same module ($1) or any sub-module under shared/.
        pathNot: "^src/module/($1|shared)/.+",
      },
    },
    {
      name: "no-shared-to-domain",
      comment:
        "module/shared/* must not depend on any domain module. " +
        "Shared sub-modules may depend on each other but never on identity, " +
        "books, app, or any other domain.",
      severity: "error",
      from: {
        path: "^src/module/shared/",
      },
      to: {
        path: "^src/module/(?!shared/|app/)([^/]+)/.+",
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
