import { closeTestPool, truncateIdentity } from '@module/shared/test-support'
import {
  createPasswordResetToken,
  createUser,
  synchronizeIdentitySchema,
  type IdentitySchemaBootstrap,
} from '@module/identity/test-support'

describe('createPasswordResetToken factory (integration)', () => {
  let bootstrap: IdentitySchemaBootstrap

  beforeAll(async () => {
    bootstrap = await synchronizeIdentitySchema()
  })

  beforeEach(async () => {
    await truncateIdentity()
  })

  afterAll(async () => {
    await bootstrap.close()
    await closeTestPool()
  })

  it('inserts a token referencing the given user with defaults', async () => {
    const user = await createUser()
    const before = Date.now()

    const token = await createPasswordResetToken({ userId: user.id })

    expect(token.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(token.userId).toBe(user.id)
    expect(token.tokenHash).toHaveLength(64)
    expect(token.expiresAt.getTime()).toBeGreaterThan(before)
  })

  it('honors expiresAt override (used to seed expired tokens for reset tests)', async () => {
    const user = await createUser()
    const expiredAt = new Date(Date.now() - 3_600_000)

    const token = await createPasswordResetToken({
      userId: user.id,
      expiresAt: expiredAt,
    })

    expect(token.expiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('honors tokenHash override so tests can correlate a known plaintext value', async () => {
    const user = await createUser()
    const knownHash = 'a'.repeat(64)

    const token = await createPasswordResetToken({
      userId: user.id,
      tokenHash: knownHash,
    })

    expect(token.tokenHash).toBe(knownHash)
  })
})
