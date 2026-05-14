import { sniffImage } from '../image-sniff'

describe('sniffImage', () => {
  it('recognizes JPEG magic bytes (FF D8 FF)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(sniffImage(buf)).toEqual({ mime: 'image/jpeg', extension: 'jpg' })
  })

  it('recognizes PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(sniffImage(buf)).toEqual({ mime: 'image/png', extension: 'png' })
  })

  it('recognizes WEBP (RIFF .... WEBP)', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
    ])
    expect(sniffImage(buf)).toEqual({ mime: 'image/webp', extension: 'webp' })
  })

  it('returns null for an unknown signature', () => {
    const buf = Buffer.from('MZ', 'ascii') // PE/EXE magic
    expect(sniffImage(buf)).toBeNull()
  })

  it('returns null on an empty buffer', () => {
    expect(sniffImage(Buffer.alloc(0))).toBeNull()
  })

  it('returns null on a buffer too short for JPEG check', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull()
  })

  it('returns null when only the RIFF header is present without WEBP marker', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('AVI ', 'ascii'),
    ])
    expect(sniffImage(buf)).toBeNull()
  })
})
