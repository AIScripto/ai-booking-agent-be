import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';

/**
 * Checks that the database matches what the code expects. Used by the deploy (scripts/check-schema.ts).
 *
 * 1. Reads one row from every table through the generated client. The client selects every column of
 *    the model, so a missing column or table fails here, with the same error the app would give.
 * 2. Compares the migrations in prisma/migrations with the ones recorded as applied in the database.
 */

export interface ModelProblem {
  model: string;
  message: string;
}

export interface MigrationGaps {
  /** In the code but not recorded as applied (or not finished). */
  notRecorded: string[];
  /** Recorded in the database but not found in the code. */
  unknown: string[];
}

type Delegate = { findFirst: () => Promise<unknown> };
type ClientLike = Record<string, unknown>;

const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

/** Reads one row from every model. Returns the models that failed, with the first line of the error. */
export async function checkModels(client: ClientLike): Promise<ModelProblem[]> {
  const problems: ModelProblem[] = [];
  for (const model of Object.keys(Prisma.ModelName)) {
    const delegate = client[lowerFirst(model)] as Delegate | undefined;
    if (!delegate || typeof delegate.findFirst !== 'function') {
      problems.push({ model, message: 'The client has no such model.' });
      continue;
    }
    try {
      await delegate.findFirst();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const line = text.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? text;
      problems.push({ model, message: line });
    }
  }
  return problems;
}

/** The migration folder names in prisma/migrations (sorted). */
export function migrationsOnDisk(dir: string = path.join(process.cwd(), 'prisma', 'migrations')): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Pure comparison, so it can be tested without a database. */
export function findMigrationGaps(onDisk: string[], recorded: string[]): MigrationGaps {
  const recordedSet = new Set(recorded);
  const diskSet = new Set(onDisk);
  return {
    notRecorded: onDisk.filter((name) => !recordedSet.has(name)),
    unknown: recorded.filter((name) => !diskSet.has(name)).sort(),
  };
}
