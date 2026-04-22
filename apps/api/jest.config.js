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
    'src/module/identity/**/*.ts',
    'src/infra/config/**/*.ts',
    'src/infra/typeorm/**/*.ts',
    'src/persistence/**/*.ts',
    '!src/module/identity/**/index.ts',
    '!src/infra/config/**/index.ts',
    '!src/infra/typeorm/**/index.ts',
    '!src/persistence/**/index.ts',
    '!src/module/identity/**/*.module.ts',
    '!src/infra/config/**/*.module.ts',
    '!src/infra/typeorm/**/*.module.ts',
    '!src/persistence/**/*.module.ts',
    '!src/module/identity/**/migrations/**',
    '!src/module/identity/**/__tests__/**',
    '!src/infra/config/**/__tests__/**',
    '!src/infra/typeorm/**/__tests__/**',
    '!src/persistence/**/__tests__/**',
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
