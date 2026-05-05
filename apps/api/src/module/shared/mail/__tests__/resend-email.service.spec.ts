import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { ResendEmailService } from '../resend-email.service'
import { MAIL_CONFIG_KEY } from '@module/shared/config'

jest.mock('resend', () => {
  const mockSend = jest.fn()
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Resend, __mockSend: mockSend } = require('resend')

describe('ResendEmailService', () => {
  let service: ResendEmailService
  let mockConfigService: {
    getOrThrow: jest.Mock
  }

  const mailConfig = {
    apiKey: 're_test_api_key',
    fromAddress: 'Plot-Twist <onboarding@resend.dev>',
    passwordResetUrl: 'http://localhost:4200/reset-password',
  }

  beforeEach(async () => {
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue(mailConfig),
    }

    jest.clearAllMocks()
    mockConfigService.getOrThrow.mockReturnValue(mailConfig)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendEmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<ResendEmailService>(ResendEmailService)
  })

  afterAll(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should create a Resend instance with the api key from config', () => {
    // Assert
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(MAIL_CONFIG_KEY)
    expect(Resend).toHaveBeenCalledWith('re_test_api_key')
  })

  describe('send', () => {
    const sendOptions = {
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    }

    it('should call Resend SDK emails.send() with correct parameters', async () => {
      // Arrange
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null })

      // Act
      await service.send(sendOptions)

      // Assert
      expect(mockSend).toHaveBeenCalledWith({
        from: 'Plot-Twist <onboarding@resend.dev>',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: undefined,
      })
    })

    it('should include optional text field when provided', async () => {
      // Arrange
      mockSend.mockResolvedValue({ data: { id: 'email-456' }, error: null })
      const optionsWithText = {
        ...sendOptions,
        text: 'Hello plain text',
      }

      // Act
      await service.send(optionsWithText)

      // Assert
      expect(mockSend).toHaveBeenCalledWith({
        from: 'Plot-Twist <onboarding@resend.dev>',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello plain text',
      })
    })

    it('should throw when Resend SDK returns an error', async () => {
      // Arrange
      const resendError = { statusCode: 422, message: 'Invalid email' }
      mockSend.mockResolvedValue({ data: null, error: resendError })

      // Act & Assert
      await expect(service.send(sendOptions)).rejects.toEqual(resendError)
    })

    it('should not throw when Resend SDK returns success', async () => {
      // Arrange
      mockSend.mockResolvedValue({ data: { id: 'email-789' }, error: null })

      // Act & Assert
      await expect(service.send(sendOptions)).resolves.toBeUndefined()
    })
  })
})
