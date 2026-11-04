import { prisma } from '../src/services/db.service';
import { checkModels, findMigrationGaps, migrationsOnDisk } from '../src/services/schema-check';

describe('Deploy schema check (DAT-007)', () => {
  it('finds no problem when the database matches the code', async () => {
    expect(await checkModels(prisma as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('reports a table that cannot be read, with the database error (the join_token failure)', async () => {
    const client = {
      tenant: { findFirst: async () => null },
      appointment: {
        findFirst: async () => {
          throw new Error('\nInvalid `prisma.appointment.findFirst()` invocation:\n\nThe column `appointments.join_token` does not exist in the current database.');
        },
      },
    };
    const problems = await checkModels(client);
    const appointment = problems.find((p) => p.model === 'Appointment');
    expect(appointment?.message).toContain('appointments.join_token');
    expect(problems.find((p) => p.model === 'Tenant')).toBeUndefined();
  });

  it('reports a model the client does not have', async () => {
    const problems = await checkModels({});
    expect(problems.length).toBeGreaterThan(5);
    expect(problems[0].message).toContain('no such model');
  });

  it('compares migrations on disk with the recorded ones', () => {
    const onDisk = ['001_init', '002_baseline', '003_telehealth'];
    expect(findMigrationGaps(onDisk, ['001_init', '002_baseline', '003_telehealth'])).toEqual({ notRecorded: [], unknown: [] });
    expect(findMigrationGaps(onDisk, ['001_init'])).toEqual({ notRecorded: ['002_baseline', '003_telehealth'], unknown: [] });
    expect(findMigrationGaps(onDisk, ['001_init', '002_baseline', '003_telehealth', '999_mystery'])).toEqual({ notRecorded: [], unknown: ['999_mystery'] });
  });

  it('reads the real migration folders of this repository', () => {
    const names = migrationsOnDisk();
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('20260827000100_add_telehealth_room_fields');
    expect(names).not.toContain('migration_lock.toml');
  });
});
