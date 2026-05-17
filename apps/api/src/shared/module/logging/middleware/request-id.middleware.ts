import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { Logger } from 'winston'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'

interface IRequest {
  headers: Record<string, string | string[] | undefined>
  requestId: string
  log: Logger
}

interface IResponse {
  setHeader(name: string, value: string): void
}

type TNextFn = (error?: unknown) => void

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(req: IRequest, res: IResponse, next: TNextFn): void {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID()

    req.requestId = requestId
    res.setHeader('x-request-id', requestId)
    req.log = this.logger.child({ requestId })

    next()
  }
}
