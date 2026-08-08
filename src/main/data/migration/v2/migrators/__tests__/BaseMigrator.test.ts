import { assistantTable } from '@data/db/schemas/assistant'
import { topicTable } from '@data/db/schemas/topic'
import type { ExecuteResult, PrepareResult, ValidateResult } from '@shared/data/migration/v2/types'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import { setupTestDatabase } from '@test-helpers/db'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { MigrationContext } from '../../core/MigrationContext'
import { BaseMigrator } from '../BaseMigrator'

/**
 * Minimal concrete migrator that exposes the protected `assertOwnedForeignKeys`
 * so it can be exercised directly against a real DB.
 */
class ProbeMigrator extends BaseMigrator {
  readonly id = 'probe'
  readonly name = 'Probe'
  readonly description = 'test-only migrator'
  readonly order = 0
  reset(): void {}
  async prepare(): Promise<PrepareResult> {
    return { success: true, itemCount: 0 }
  }
  async execute(): Promise<ExecuteResult> {
    return { success: true, processedCount: 0 }
  }
  async validate(): Promise<ValidateResult> {
    return { success: true, errors: [], stats: { sourceCount: 0, targetCount: 0, skippedCount: 0 } }
  }
  checkOwnedForeignKeys(db: MigrationContext['db'], tables: Parameters<BaseMigrator['assertOwnedForeignKeys']>[1]) {
    return this.assertOwnedForeignKeys(db, tables)
  }
}

async function insertAssistant(db: ReturnType<typeof setupTestDatabase>['db'], id: string) {
  await db
    .insert(assistantTable)
    .values({ id, name: 'A', emoji: '🍒', settings: DEFAULT_ASSISTANT_SETTINGS, orderKey: 'a0' })
}

async function insertTopic(db: ReturnType<typeof setupTestDatabase>['db'], id: string, assistantId: string) {
  await db.insert(topicTable).values({ id, assistantId, name: 'T', activeNodeId: null, orderKey: 'a0' })
}

describe('BaseMigrator.assertOwnedForeignKeys', () => {
  const dbh = setupTestDatabase()
  const probe = new ProbeMigrator()

  it('throws when an owned table has an unsatisfied foreign key', async () => {
    // FK=OFF lets us stage a dangling reference, mirroring the migration window.
    dbh.db.run(sql`PRAGMA foreign_keys = OFF`)
    await insertTopic(dbh.db, 'topic_x', 'ghost-assistant') // assistantId not present

    expect(() => probe.checkOwnedForeignKeys(dbh.db, [topicTable])).toThrow(/foreign-key violation/)
  })

  it('does not throw when owned tables are referentially consistent', async () => {
    dbh.db.run(sql`PRAGMA foreign_keys = OFF`)
    await insertAssistant(dbh.db, 'a1')
    await insertTopic(dbh.db, 't1', 'a1')

    expect(probe.checkOwnedForeignKeys(dbh.db, [assistantTable, topicTable])).toBeUndefined()
  })

  it('aggregates violations across multiple owned tables', async () => {
    dbh.db.run(sql`PRAGMA foreign_keys = OFF`)
    await insertTopic(dbh.db, 't_dangling', 'ghost-assistant')

    // assistantTable is clean; topicTable has the dangling ref — must still throw.
    expect(() => probe.checkOwnedForeignKeys(dbh.db, [assistantTable, topicTable])).toThrow(
      /ProbeMigrator left \d+ foreign-key violation/
    )
  })

  it('checks only the tables passed in (a dangling ref in an unlisted table is ignored)', async () => {
    dbh.db.run(sql`PRAGMA foreign_keys = OFF`)
    await insertTopic(dbh.db, 't_unlisted', 'ghost-assistant') // violation lives in topic

    // Only assistantTable is passed → the topic violation is out of scope here.
    expect(probe.checkOwnedForeignKeys(dbh.db, [assistantTable])).toBeUndefined()
  })
})
