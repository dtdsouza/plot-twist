export interface ISniffedImage {
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp'
  readonly extension: 'jpg' | 'png' | 'webp'
}

export function sniffImage(buffer: Buffer): ISniffedImage | null {
  if (isJpeg(buffer)) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }
  if (isPng(buffer)) {
    return { mime: 'image/png', extension: 'png' }
  }
  if (isWebp(buffer)) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  return null
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
}

function isWebp(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
}
