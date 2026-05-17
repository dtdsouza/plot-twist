import { Test, TestingModule } from '@nestjs/testing'
import { EmailClient } from '../client/email.client'
import { EMAIL_PROVIDER } from '../provider/email-provider.interface'

describe('EmailClient', () => {
  let client: EmailClient
  let mockProvider: { send: jest.Mock }

  const sendOptions = {
    to: 'user@example.com',
    subject: 'Test Subject',
    html: '<p>Hello</p>',
  }

  beforeEach(async () => {
    mockProvider = { send: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailClient,
        { provide: EMAIL_PROVIDER, useValue: mockProvider },
      ],
    }).compile()

    client = module.get<EmailClient>(EmailClient)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(client).toBeDefined()
  })

  it('delegates send to the injected provider', async () => {
    // Act
    await client.send(sendOptions)

    // Assert
    expect(mockProvider.send).toHaveBeenCalledWith(sendOptions)
    expect(mockProvider.send).toHaveBeenCalledTimes(1)
  })

  it('rethrows provider errors so callers can react', async () => {
    // Arrange
    const failure = new Error('Provider down')
    mockProvider.send.mockRejectedValueOnce(failure)

    // Act & Assert
    await expect(client.send(sendOptions)).rejects.toBe(failure)
  })
})
