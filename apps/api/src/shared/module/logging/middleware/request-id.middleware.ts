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

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/

function resolveSafeRequestId(inbound: string | undefined): string {
  if (inbound !== undefined && SAFE_REQUEST_ID_REGEX.test(inbound)) {
    return inbound
  }
  return randomUUID()
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(req: IRequest, res: IResponse, next: TNextFn): void {
    const raw = req.headers['x-request-id']
    const requestId = resolveSafeRequestId(Array.isArray(raw) ? raw[0] : raw)

    req.requestId = requestId
    res.setHeader('x-request-id', requestId)
    req.log = this.logger.child({ requestId })

    next()
  }
}
