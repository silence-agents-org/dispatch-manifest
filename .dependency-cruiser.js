/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'adr-047-no-cross-org-hard-imports',
      severity: 'error',
      from: {
        path: '^(src|lib|scripts)/|^\\.github/workflows/'
      },
      to: {
        path: '^@(?!(silence-agents-org)/)[^/]+/'
      },
      comment:
        'ADR-047: Cross-org HARD_IMPORT strictly forbidden. Use RUNTIME_REFERENCE only.'
    }
  ],
  options: {
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    includeOnly: '^(src|lib|scripts)/|^\\.github/workflows/',
    exclude: '(^node_modules)|(^vendor)|(^\\.generated)',
    doNotFollow: {
      path: 'node_modules'
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      }
    }
  }
};
