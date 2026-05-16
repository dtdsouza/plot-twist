import { closeTestPool } from '@module/shared/test-support'
import {
  createEmailChangeToken,
  createUser,
  synchronizeIdentitySchema,
  truncateIdentity,
  type IdentitySchemaBootstrap,
} from '@module/identity/test-support'

describe('createEmailChangeToken factory (integration)', () => {
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

  it('inserts a token with the supplied userId and newEmail', async () => {
    const user = await createUser()

    const token = await createEmailChangeToken({
      userId: user.id,
      newEmail: 'new@factory.test',
    })

    expect(token.userId).toBe(user.id)
    expect(token.newEmail).toBe('new@factory.test')
    expect(token.tokenHash).toHaveLength(64)
  })

  it('honors expiresAt and tokenHash overrides', async () => {
    const user = await createUser()
    const expiredAt = new Date(Date.now() - 3_600_000)
    const knownHash = 'b'.repeat(64)

    const token = await createEmailChangeToken({
      userId: user.id,
      newEmail: 'expired@factory.test',
      expiresAt: expiredAt,
      tokenHash: knownHash,
    })

    expect(token.expiresAt.getTime()).toBeLessThan(Date.now())
    expect(token.tokenHash).toBe(knownHash)
  })
})
