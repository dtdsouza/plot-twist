import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import type { Logger } from 'winston'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'

interface IRequest {
  method: string
  originalUrl?: string
  url: string
  requestId?: string
  log?: Logger
}

interface IResponse {
  statusCode: number
  on(event: string, handler: () => void): void
}

type TNextFn = (error?: unknown) => void

const CONTEXT = 'http'

function resolveLevel(statusCode: number): 'info' | 'warn' | 'error' {
  if (statusCode < 400) return 'info'
  if (statusCode < 500) return 'warn'
  return 'error'
}

@Injectable()
export class HttpAccessMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(req: IRequest, res: IResponse, next: TNextFn): void {
    const startedAt = Date.now()

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt
      const statusCode = res.statusCode
      const level = resolveLevel(statusCode)
      const requestId = req.requestId
      const meta = {
        method: req.method,
        url: req.originalUrl ?? req.url,
        statusCode,
        durationMs,
        requestId,
        context: CONTEXT,
      }

      const log = req.log ?? this.logger
      log[level]('HTTP request', meta)
    })

    next()
  }
}
