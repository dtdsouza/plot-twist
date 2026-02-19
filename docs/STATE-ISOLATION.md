# State Isolation

Rules for keeping each bounded context's data ownership clear and preventing cross-context database coupling. Plot-Twist uses a single PostgreSQL instance with **schema-per-context** isolation.

**Related docs:** [Modular Principles](./MODULAR-PRINCIPLES.md) | [Resilience & Observability](./RESILIENCE-OBSERVABILITY.md) | [Domain Definitions](./DOMAINS-DEFINITION.md)

---

## Schema Ownership

Each bounded context owns exactly one PostgreSQL schema. See [DOMAINS-DEFINITION.md](./DOMAINS-DEFINITION.md) section 6 for the full ownership table.

| Context | Schema | Owner Library |
|---------|--------|---------------|
| Identity | `identity` | `data-access-identity` |
| Social | `social` | `data-access-social` |
| Clubs | `clubs` | `data-access-clubs` |
| Reading | `reading` | `data-access-reading` |
| Meetings | `meetings` | `data-access-meetings` |

---

## Rule 1: Schema Decorator on Every Entity

Every TypeORM entity MUST declare its schema and table name explicitly in the `@Entity()` decorator. Omitting the schema causes the entity to land in the `public` schema, breaking isolation.

```typescript
// CORRECT -- explicit schema and table name
@Entity({ schema: 'clubs', name: 'club' })
export class ClubEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column({ type: 'uuid' })
  ownerId: string
}
```

```typescript
// WRONG -- missing schema, lands in public
@Entity()
export class ClubEntity { /* ... */ }

// WRONG -- schema without table name
@Entity({ schema: 'clubs' })
export class ClubEntity { /* ... */ }
```

**Detection command:**

```bash
# Find entities missing the schema property
grep -rn "@Entity()" --include="*.entity.ts" libs/ | grep -v "schema:"
```

Any match from this command is a violation that must be fixed before merging.

---

## Rule 2: No Cross-Schema JOINs

TypeORM relations (`@ManyToOne`, `@OneToMany`, `@ManyToMany`) MUST only reference entities within the same schema. Cross-context references use plain `string` columns with the foreign entity's ID -- no `@JoinColumn`, no `@ManyToOne`.

```typescript
// CORRECT -- same schema relation (clubs.membership -> clubs.club)
@Entity({ schema: 'clubs', name: 'membership' })
export class MembershipEntity {
  @ManyToOne(() => ClubEntity, (club) => club.memberships)
  @JoinColumn({ name: 'clubId' })
  club: ClubEntity

  @Column({ type: 'uuid' })
  clubId: string
}
```

```typescript
// CORRECT -- cross-context reference (meetings -> clubs by ID only)
@Entity({ schema: 'meetings', name: 'meeting' })
export class MeetingEntity {
  @Column({ type: 'uuid' })
  clubId: string   // references clubs.club.id -- NO relation decorator

  @Column({ type: 'uuid', nullable: true })
  bookId: string   // references reading.book.id -- NO relation decorator
}
```

```typescript
// WRONG -- cross-schema relation
@Entity({ schema: 'meetings', name: 'meeting' })
export class MeetingEntity {
  @ManyToOne(() => ClubEntity)  // ClubEntity is in 'clubs' schema
  @JoinColumn({ name: 'clubId' })
  club: ClubEntity
}
```

**Detection command:**

```bash
# Find TypeORM relation decorators in entity files, then verify
# each referenced entity belongs to the same schema
grep -rn "@ManyToOne\|@OneToMany\|@ManyToMany\|@OneToOne" --include="*.entity.ts" libs/
```

Review each match: if the referenced entity class belongs to a different `libs/{scope}/` directory, it is a violation.

---

## Rule 3: Migration Ownership

Each `data-access-*` library owns its migrations. Migrations for a context MUST only create, alter, or drop tables within that context's schema.

```
libs/clubs/data-access-clubs/
  src/
    migrations/
      1700000000000-CreateClubTables.ts
      1700100000000-AddClubDescription.ts
```

Each context's TypeORM data source configuration must specify:

```typescript
// In data-access-clubs module configuration
{
  schema: 'clubs',
  entities: [ClubEntity, MembershipEntity, InvitationEntity],
  migrations: ['libs/clubs/data-access-clubs/src/migrations/*.ts'],
  migrationsTableName: 'clubs_migrations',
}
```

Key requirements:

- `migrationsTableName` is unique per context (e.g., `clubs_migrations`, `reading_migrations`) to prevent migration table collisions.
- A migration file in `data-access-clubs` must never reference tables in the `reading` or `meetings` schema.
- Schema creation (`CREATE SCHEMA IF NOT EXISTS`) should be handled in the migration or the database module bootstrap.

**Detection command:**

```bash
# Find migrations referencing schemas they do not own
# Example: a clubs migration should not mention 'reading.' or 'meetings.'
grep -rn "reading\.\|meetings\.\|social\.\|identity\." \
  libs/clubs/data-access-clubs/src/migrations/
```

---

## Rule 4: Application-Layer Assembly

When a feature needs data from multiple contexts, assembly happens in the service layer -- never via database JOINs.

```typescript
// CORRECT -- application-layer assembly in MeetingService
@Injectable()
export class MeetingService {
  constructor(
    @InjectRepository(MeetingEntity)
    private readonly meetingRepository: Repository<MeetingEntity>,
    @Inject(CLUB_RESOLVER) private readonly clubResolver: IClubResolver,
    @Inject(BOOK_RESOLVER) private readonly bookResolver: IBookResolver,
  ) {}

  async getMeetingDetail(meetingId: string): Promise<IMeetingDetail> {
    const meeting = await this.meetingRepository.findOneOrFail({
      where: { id: meetingId },
    })

    const [club, book] = await Promise.all([
      this.clubResolver.getById(meeting.clubId),
      meeting.bookId ? this.bookResolver.getById(meeting.bookId) : null,
    ])

    return {
      ...meeting,
      clubName: club.name,
      bookTitle: book?.title ?? null,
    }
  }
}
```

```typescript
// WRONG -- cross-schema JOIN in a query builder
const meetings = await this.meetingRepository
  .createQueryBuilder('meeting')
  .leftJoinAndSelect('clubs.club', 'club', 'club.id = meeting.clubId')  // cross-schema JOIN
  .getMany()
```

Resolvers (`IClubResolver`, `IBookResolver`) are interfaces provided via DI tokens, consistent with the [Replaceability principle](./MODULAR-PRINCIPLES.md#6-replaceability).

---

## Compliance Checklist

Before merging code that touches entities or migrations:

- [ ] Every entity has `@Entity({ schema: '...', name: '...' })` with both properties
- [ ] TypeORM relations only reference entities in the same schema
- [ ] Cross-context references use `@Column({ type: 'uuid' })` with no relation decorator
- [ ] Migrations only touch tables in their owning schema
- [ ] Each data source has a unique `migrationsTableName`
- [ ] Cross-context data is assembled in the service layer, not via JOINs
- [ ] Detection commands pass with no violations

---

## Quick Reference

| Rule | One-Line Summary |
|------|-----------------|
| Schema Decorator | Every entity: `@Entity({ schema: '...', name: '...' })` |
| No Cross-Schema JOINs | TypeORM relations within same schema only; string IDs across contexts |
| Migration Ownership | Each `data-access-*` owns its migrations; unique `migrationsTableName` |
| Application-Layer Assembly | Cross-context data assembled in services, never via DB JOINs |
