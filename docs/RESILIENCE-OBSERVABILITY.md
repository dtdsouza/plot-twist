# Resilience and Observability

Patterns for structured logging, health checks, failure isolation, and error handling in the Plot-Twist monolith. These rules apply now and are designed to scale when contexts are extracted into separate services.

**Related docs:** [Modular Principles](./MODULAR-PRINCIPLES.md) | [State Isolation](./STATE-ISOLATION.md) | [Domain Definitions](./DOMAINS-DEFINITION.md)

---

## 1. Structured Logging

Every service uses the NestJS `Logger` with a consistent context string matching `{Module}.{Class}`. Logs include structured metadata for filtering and correlation.

```typescript
@Injectable()
export class ClubService {
  private readonly logger = new Logger('Clubs.ClubService')

  async createClub(dto: ICreateClubDto): Promise<ClubEntity> {
    this.logger.log('Creating club', { module: 'clubs', operation: 'createClub', ownerId: dto.ownerId })
    const saved = await this.clubRepository.save(this.clubRepository.create(dto))
    this.logger.log('Club created', { module: 'clubs', operation: 'createClub', clubId: saved.id })
    return saved
  }
}
```

### Logging Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `log` | Normal operations, key lifecycle events | Club created, meeting scheduled |
| `warn` | Recoverable issues, degraded behavior | Book search API returned empty, retry triggered |
| `error` | Failures that need attention | Database connection lost, external API unreachable |
| `debug` | Development-only detail | Query parameters, intermediate computation steps |

**Rules:**
- Never log sensitive data (passwords, tokens, email addresses in plain text).
- Never use `console.log` -- always use the NestJS `Logger`.
- Always include `module` and `operation` in structured metadata.
- Log at entry and exit of significant operations (not every function call).

---

## 2. Health Checks

Use `@nestjs/terminus` to expose a `/health` endpoint. Each bounded context contributes its own `HealthIndicator` so failures are attributable to a specific context.

```typescript
// In shared/data-access-database or a dedicated health module
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ])
  }
}
```

For contexts with external dependencies (e.g., Reading depends on Google Books API), add a context-specific health indicator:

```typescript
@Injectable()
export class BookSearchHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(BOOK_SEARCH_PROVIDER)
    private readonly bookSearch: IBookSearchProvider,
  ) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.bookSearch.search('health-check')
      return this.getStatus(key, true)
    } catch {
      return this.getStatus(key, false, { message: 'Book search API unreachable' })
    }
  }
}
```

**Rule:** Every external dependency must have a corresponding health indicator.

---

## 3. EventEmitter2 Failure Isolation

Domain events via EventEmitter2 are in-process and synchronous by default. A failing event handler must not crash the publisher or break the originating request.

### Critical vs Non-Critical Events

| Category | Behavior on Failure | Example |
|----------|-------------------|---------|
| Critical | Throw -- transaction rolls back | `ReadingStarted` fails to validate club existence |
| Non-Critical | Log error, continue | `MeetingScheduled` fails to send notification |

```typescript
// Non-critical handler -- catch and log, never propagate
@OnEvent('meeting.scheduled')
async handleMeetingScheduled(payload: IMeetingScheduledEvent): Promise<void> {
  try {
    await this.notificationService.notifyMembers(payload.clubId, {
      type: 'meeting-scheduled',
      meetingId: payload.meetingId,
      date: payload.date,
    })
  } catch (error) {
    this.logger.error('Failed to send meeting notification', {
      module: 'meetings',
      operation: 'handleMeetingScheduled',
      meetingId: payload.meetingId,
      error: error.message,
    })
    // Do NOT re-throw -- the meeting was created successfully
  }
}
```

```typescript
// Critical handler -- let the error propagate so the caller can roll back
@OnEvent('reading.started')
async handleReadingStarted(payload: IReadingStartedEvent): Promise<void> {
  const club = await this.clubResolver.getById(payload.clubId)
  if (!club) {
    throw new Error(`Club ${payload.clubId} not found for reading ${payload.clubReadingId}`)
  }
  // Proceed with critical logic...
}
```

**Rule:** Every `@OnEvent` handler must be explicitly categorized as critical or non-critical. Non-critical handlers MUST wrap their body in try/catch.

---

## 4. External API Resilience

Plot-Twist integrates with external APIs (Google Books for book search, Google Meet for video links). Every external call must have timeout, retry, and fallback behavior defined.

```typescript
@Injectable()
export class GoogleBooksProvider implements IBookSearchProvider {
  private readonly logger = new Logger('Reading.GoogleBooksProvider')
  private static readonly TIMEOUT_MS = 5000
  private static readonly MAX_RETRIES = 2

  async search(query: string): Promise<IBookSearchResult[]> {
    for (let attempt = 1; attempt <= GoogleBooksProvider.MAX_RETRIES; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.get('/volumes', {
            params: { q: query },
            timeout: GoogleBooksProvider.TIMEOUT_MS,
          }),
        )
        return this.mapResults(response.data)
      } catch (error) {
        this.logger.warn('Google Books API attempt failed', {
          module: 'reading', operation: 'search', attempt, error: error.message,
        })
        if (attempt === GoogleBooksProvider.MAX_RETRIES) return []  // Graceful fallback
      }
    }
    return []
  }
}
```

### External API Contract

| API | Timeout | Retries | Fallback |
|-----|---------|---------|----------|
| Google Books | 5s | 2 | Empty results |
| Google Meet | 5s | 1 | Manual link entry by user |

**Rule:** Every external API call must define timeout, retry count, and fallback behavior. The fallback must never break the user's workflow -- degrade gracefully.

---

## 5. Error Handling Contract

All errors returned to clients must use NestJS `HttpException` subclasses. Internal implementation details (stack traces, database errors, third-party API responses) must never leak to the client.

```typescript
// CORRECT -- domain-specific exceptions with user-friendly messages
async startReading(clubId: string, bookId: string): Promise<ClubReadingEntity> {
  const activeReading = await this.clubReadingRepository.findOne({
    where: { clubId, status: EReadingStatus.ACTIVE },
  })
  if (activeReading) throw new ConflictException('Club already has an active reading')

  const book = await this.bookRepository.findOne({ where: { id: bookId } })
  if (!book) throw new NotFoundException('Book not found')

  return this.clubReadingRepository.save(
    this.clubReadingRepository.create({ clubId, bookId, status: EReadingStatus.ACTIVE }),
  )
}

// WRONG -- leaking internals
throw new InternalServerErrorException(error.stack)
```

### Exception Mapping

| Situation | Exception | HTTP Status |
|-----------|-----------|-------------|
| Entity not found | `NotFoundException` | 404 |
| Business rule violation | `ConflictException` | 409 |
| Invalid input | `BadRequestException` | 400 |
| Unauthorized access | `UnauthorizedException` | 401 |
| Forbidden action | `ForbiddenException` | 403 |
| Unexpected failure | `InternalServerErrorException` | 500 |

**Rule:** Log the full error internally (with stack trace), but return only a user-friendly message to the client.

---

## Compliance Checklist

Before merging code that adds services, event handlers, or external integrations:

- [ ] All services use NestJS `Logger` with `{Module}.{Class}` context
- [ ] No `console.log` or `console.error` statements
- [ ] Structured metadata includes `module` and `operation`
- [ ] No sensitive data in log output
- [ ] External dependencies have health indicators
- [ ] Every `@OnEvent` handler is categorized as critical or non-critical
- [ ] Non-critical event handlers wrap body in try/catch
- [ ] External API calls define timeout, retries, and fallback
- [ ] All client-facing errors use `HttpException` subclasses
- [ ] No internal details (stack traces, DB errors) in error responses

---

## Quick Reference

| Topic | One-Line Rule |
|-------|---------------|
| Logging | NestJS `Logger` with `{Module}.{Class}` context; structured metadata |
| Health Checks | `@nestjs/terminus`; one indicator per external dependency |
| Event Isolation | Non-critical `@OnEvent` handlers MUST try/catch; critical handlers may throw |
| External APIs | Timeout + retries + graceful fallback for every external call |
| Error Handling | `HttpException` subclasses only; never leak internals to the client |
