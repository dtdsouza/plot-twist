import { Logger } from '@nestjs/common'
import { TestingModuleBuilder } from '@nestjs/testing'

// Silence Nest's Logger during tests to keep CI output focused on assertions.
// To re-enable locally for debugging, run with `TEST_LOGS=1` (e.g. `TEST_LOGS=1 pnpm nx test api`).
if (!process.env.TEST_LOGS) {
  Logger.overrideLogger(false)

  // `Test.createTestingModule().compile()` calls `applyLogger()` internally,
  // which re-installs a `TestingLogger` that still emits error-level logs.
  // Replace it with a no-op so our override survives compile().
  ;(TestingModuleBuilder.prototype as unknown as { applyLogger: () => void }).applyLogger = () => {
    Logger.overrideLogger(false)
  }
}
