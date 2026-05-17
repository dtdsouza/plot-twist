import type { Logger } from 'winston'

// Augment the express Request interface to include logging fields
// added by RequestIdMiddleware.
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string
    log: Logger
  }
}
