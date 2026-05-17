import { Test, type TestingModule } from '@nestjs/testing'
import { StorageClient } from '../storage.client'
import { STORAGE_PORT, type IStoragePort } from '../../port/storage.port'

describe('StorageClient', () => {
  let client: StorageClient
  let provider: jest.Mocked<IStoragePort>

  beforeEach(async () => {
    provider = {
      createPresignedPost: jest.fn(),
      headObject: jest.fn(),
      getObjectRange: jest.fn(),
      copyObject: jest.fn(),
      deleteObject: jest.fn(),
      buildPublicUrl: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageClient,
        { provide: STORAGE_PORT, useValue: provider },
      ],
    }).compile()

    client = module.get(StorageClient)
  })

  it('is defined', () => {
    expect(client).toBeDefined()
  })

  describe('createPresignedPost', () => {
    it('delegates to provider and returns its result', async () => {
      // Arrange
      const expected = {
        url: 'https://example.com/bucket',
        fields: { key: 'k' },
        key: 'k',
        expiresAt: new Date(),
      }
      provider.createPresignedPost.mockResolvedValue(expected)

      // Act
      const result = await client.createPresignedPost({
        bucket: 'b',
        key: 'k',
        maxContentLength: 1000,
        contentTypePrefix: 'image/',
        expiresInSeconds: 300,
      })

      // Assert
      expect(result).toBe(expected)
      expect(provider.createPresignedPost).toHaveBeenCalledWith({
        bucket: 'b',
        key: 'k',
        maxContentLength: 1000,
        contentTypePrefix: 'image/',
        expiresInSeconds: 300,
      })
    })
  })

  describe('headObject', () => {
    it('returns metadata when provider finds the object', async () => {
      // Arrange
      const metadata = {
        contentType: 'image/png',
        contentLength: 1024,
        etag: '"abc"',
      }
      provider.headObject.mockResolvedValue(metadata)

      // Act
      const result = await client.headObject('b', 'k')

      // Assert
      expect(result).toEqual(metadata)
      expect(provider.headObject).toHaveBeenCalledWith('b', 'k')
    })

    it('returns null when provider reports not-found', async () => {
      // Arrange
      provider.headObject.mockResolvedValue(null)

      // Act
      const result = await client.headObject('b', 'missing')

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('getObjectRange', () => {
    it('returns the buffer from the provider', async () => {
      // Arrange
      const buffer = Buffer.from([1, 2, 3, 4])
      provider.getObjectRange.mockResolvedValue(buffer)

      // Act
      const result = await client.getObjectRange('b', 'k', '0-3')

      // Assert
      expect(result).toBe(buffer)
      expect(provider.getObjectRange).toHaveBeenCalledWith('b', 'k', '0-3')
    })
  })

  describe('copyObject', () => {
    it('delegates copy parameters to the provider', async () => {
      // Arrange
      provider.copyObject.mockResolvedValue(undefined)

      // Act
      await client.copyObject('src-b', 'src-k', 'dst-b', 'dst-k')

      // Assert
      expect(provider.copyObject).toHaveBeenCalledWith(
        'src-b',
        'src-k',
        'dst-b',
        'dst-k',
      )
    })
  })

  describe('deleteObject', () => {
    it('delegates delete to the provider', async () => {
      // Arrange
      provider.deleteObject.mockResolvedValue(undefined)

      // Act
      await client.deleteObject('b', 'k')

      // Assert
      expect(provider.deleteObject).toHaveBeenCalledWith('b', 'k')
    })
  })

  describe('buildPublicUrl', () => {
    it('returns the URL the provider builds', () => {
      // Arrange
      provider.buildPublicUrl.mockReturnValue('https://cdn.example.com/b/k')

      // Act
      const url = client.buildPublicUrl('b', 'k')

      // Assert
      expect(url).toBe('https://cdn.example.com/b/k')
      expect(provider.buildPublicUrl).toHaveBeenCalledWith('b', 'k')
    })
  })
})
