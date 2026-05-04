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
    'src/module/shared/config/**/*.ts',
    'src/module/shared/typeorm/**/*.ts',
    'src/module/shared/persistence/**/*.ts',
    '!src/module/identity/**/index.ts',
    '!src/module/shared/config/**/index.ts',
    '!src/module/shared/typeorm/**/index.ts',
    '!src/module/shared/persistence/**/index.ts',
    '!src/module/identity/**/*.module.ts',
    '!src/module/shared/config/**/*.module.ts',
    '!src/module/shared/typeorm/**/*.module.ts',
    '!src/module/shared/persistence/**/*.module.ts',
    '!src/module/identity/**/migrations/**',
    '!src/module/identity/**/__tests__/**',
    '!src/module/shared/config/**/__tests__/**',
    '!src/module/shared/typeorm/**/__tests__/**',
    '!src/module/shared/persistence/**/__tests__/**',
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
