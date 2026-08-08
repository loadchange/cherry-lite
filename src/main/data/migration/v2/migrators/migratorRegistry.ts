/**
 * Migrator registration — assembles every migrator in execution order.
 */

import { AiUsageRecordMigrator } from './AiUsageRecordMigrator'
import { AssistantMigrator } from './AssistantMigrator'
import { BootConfigMigrator } from './BootConfigMigrator'
import { ChatMigrator } from './ChatMigrator'
import { FileMigrator } from './FileMigrator'
import { McpServerMigrator } from './McpServerMigrator'
import { PreferencesMigrator } from './PreferencesMigrator'
import { PromptMigrator } from './PromptMigrator'
import { ProviderModelMigrator } from './ProviderModelMigrator'
import { TranslateMigrator } from './TranslateMigrator'

/**
 * Get all registered migrators in execution order
 */
export function getAllMigrators() {
  return [
    new BootConfigMigrator(),
    new PreferencesMigrator(),
    new McpServerMigrator(),
    new ProviderModelMigrator(),
    new AssistantMigrator(),
    new FileMigrator(),
    new ChatMigrator(),
    new AiUsageRecordMigrator(),
    new TranslateMigrator(),
    new PromptMigrator()
  ]
}
