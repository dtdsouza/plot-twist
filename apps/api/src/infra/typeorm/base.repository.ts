import { NotFoundException } from '@nestjs/common'
import {
  Repository,
  FindOptionsWhere,
  DeepPartial,
  FindManyOptions,
} from 'typeorm'
import { BaseEntity } from './base.entity'

export interface IFindManyOptions<T> {
  readonly where?: FindOptionsWhere<T>
  readonly take?: number
  readonly skip?: number
  readonly order?: FindManyOptions<T>['order']
}

export abstract class BaseRepository<T extends BaseEntity> {
  constructor(protected readonly repository: Repository<T>) {}

  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    const entity = await this.repository.findOne({ where })
    return entity ? { ...entity } : null
  }

  async findMany(options?: IFindManyOptions<T>): Promise<readonly T[]> {
    const entities = await this.repository.find({
      where: options?.where,
      take: options?.take,
      skip: options?.skip,
      order: options?.order,
    })
    return entities.map((e) => ({ ...e }))
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data)
    const saved = await this.repository.save(entity)
    return { ...saved }
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    const existing = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    })
    if (!existing) {
      throw new NotFoundException(`Entity with id ${id} not found`)
    }
    const merged = this.repository.merge(existing, data)
    const saved = await this.repository.save(merged)
    return { ...saved }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    })
    if (!existing) {
      throw new NotFoundException(`Entity with id ${id} not found`)
    }
    await this.repository.remove(existing)
  }
}
