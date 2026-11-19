#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b2c153e63204237c1f10bca1d2a27423e146b75f265c2f1921cec05a28110dde/contract';
import startContract from '../../snapshots/b2c153e63204237c1f10bca1d2a27423e146b75f265c2f1921cec05a28110dde/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f9adb0c3c0853a583d06f4829bdd074433fffe79a7b2db6a4158d78f40311655/contract';
import endContract from '../../snapshots/f9adb0c3c0853a583d06f4829bdd074433fffe79a7b2db6a4158d78f40311655/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'authIdentity',
        constraint: 'authIdentity_provider_check_ced8a431',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'authIdentity',
        constraint: 'authIdentity_provider_check_60ddbd51',
        expression: "\"provider\" IN ('GOOGLE', 'LINKEDIN')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
