import * as bcrypt from 'bcryptjs'
import { closeTestPool } from '@module/shared/test-support'
import {
  createUser,
  synchronizeIdentitySchema,
  truncateIdentity,
  TEST_DEFAULT_PASSWORD,
  type IdentitySchemaBootstrap,
} from '@module/identity/test-support'

describe('createUser factory (integration)', () => {
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

  it('inserts a row with sensible defaults and returns the full row', async () => {
    const user = await createUser()

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.email).toMatch(/@factory\.test$/)
    expect(user.displayName).toBeTruthy()
    expect(user.avatar).toBeNull()
    expect(user.bio).toBeNull()
    expect(user.status).toBe('active')
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(user.updatedAt).toBeInstanceOf(Date)
    expect(bcrypt.compareSync(TEST_DEFAULT_PASSWORD, user.passwordHash)).toBe(true)
  })

  it('respects email + plainPassword overrides', async () => {
    const user = await createUser({
      email: 'override@factory.test',
      plainPassword: 'custom-password',
      displayName: 'Override User',
    })

    expect(user.email).toBe('override@factory.test')
    expect(user.displayName).toBe('Override User')
    expect(bcrypt.compareSync('custom-password', user.passwordHash)).toBe(true)
  })

  it('produces two distinct rows when called twice with no overrides', async () => {
    const a = await createUser()
    const b = await createUser()

    expect(a.id).not.toBe(b.id)
    expect(a.email).not.toBe(b.email)
  })

  it('rejects with a unique-violation error when the same email is inserted twice', async () => {
    await createUser({ email: 'dup@factory.test' })

    await expect(createUser({ email: 'dup@factory.test' })).rejects.toMatchObject({
      code: '23505',
    })
  })
})
