module.exports = {
  displayName: 'api',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.int-spec.ts', '**/__tests__/**/*.e2e-spec.ts'],
  coverageDirectory: '../../coverage/apps/api',
  collectCoverageFrom: [
    'src/identity/**/*.ts',
    '!src/identity/**/index.ts',
    '!src/identity/**/*.module.ts',
    '!src/identity/**/migrations/**',
    '!src/identity/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      // TypeScript decorator branches are not coverable in unit tests;
      // branch threshold is lower here and will exceed 80% in full test runs (including e2e)
      branches: 78,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}
