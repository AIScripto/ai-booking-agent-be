/**
 * Deploy check: does the database match the code? Read only.
 *
 *   docker compose exec -T api node dist/scripts/check-schema.js
 *
 * Exit code 0 = fine. Exit code 1 = a problem (the deploy prints it loudly).
 * Born from a real failure: the live database lacked columns the code needed, and nobody noticed
 * until a user opened the dashboard. Not imported by runtime code.
 */
import { prisma } from '../services/db.service';
import { checkModels, findMigrationGaps, migrationsOnDisk } from '../services/schema-check';

async function main(): Promise<number> {
  let failed = false;

  const modelProblems = await checkModels(prisma as unknown as Record<string, unknown>);
  if (modelProblems.length === 0) {
    console.log('OK   every table can be read with all the columns the code expects.');
  } else {
    failed = true;
    console.error('FAIL some tables cannot be read:');
    for (const p of modelProblems) console.error(`       ${p.model}: ${p.message}`);
  }

  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const gaps = findMigrationGaps(
    migrationsOnDisk(),
    rows.map((r) => r.migration_name)
  );
  if (gaps.notRecorded.length === 0 && gaps.unknown.length === 0) {
    console.log('OK   every migration in the code is recorded as applied.');
  } else {
    failed = true;
    if (gaps.notRecorded.length) console.error(`FAIL migrations not applied or not recorded: ${gaps.notRecorded.join(', ')}`);
    if (gaps.unknown.length) console.error(`FAIL migrations recorded in the database but missing from the code: ${gaps.unknown.join(', ')}`);
  }

  return failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('FAIL the schema check could not run:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
