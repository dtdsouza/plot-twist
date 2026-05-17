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
        "A domain module may only import from itself or from src/shared/*. " +
        "src/app.module.ts is the orchestrator and is excluded as a source. " +
        "src/shared/* is excluded as a source because its outbound rules " +
        "are enforced separately by no-shared-to-domain.",
      severity: "error",
      from: {
        // Captures the domain name as $1; only matches files inside src/module/{domain}/
        path: "^src/module/([^/]+)/.+",
      },
      to: {
        path: "^src/module/([^/]+)/.+",
        // $1 is substituted per-file with the source module name.
        // Allowed destinations: same module ($1) only — shared lives outside src/module/ now.
        pathNot: "^src/module/$1/.+",
      },
    },
    {
      name: "no-shared-to-domain",
      comment:
        "src/shared/* must not depend on any domain module under src/module/*. " +
        "Shared libraries and shared modules may depend on each other but never on " +
        "identity, books, or any other domain.",
      severity: "error",
      from: {
        path: "^src/shared/",
      },
      to: {
        path: "^src/module/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules|__tests__|__test-support__|migrations|\\.spec\\.ts$|\\.int-spec\\.ts$|\\.e2e-spec\\.ts$",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.app.json",
    },
  },
};
