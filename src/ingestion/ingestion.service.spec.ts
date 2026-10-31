import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import type { ScrapedJobType } from '@talent-nexus/contracts/grpc';
import type { IngestionRepository } from './ingestion.repository.js';

import { IngestionService } from './ingestion.service.js';

const incomingJob: ScrapedJobType = {
  externalId: 'fixture-001',
  sourceUrl: 'https://example.com/jobs/fixture-001',
  title: 'Changed title from crawler',
  companyName: 'Example Company',
  description: 'Changed description from crawler',
  location: 'Yangon',
  applicationUrl: [],
};

describe('IngestionService', () => {
  it.each(['PUBLISHED', 'REJECTED', 'CLOSED'])(
    'preserves content when the existing job is %s',
    async (status) => {
      const repository = {
        findBySource: vi.fn().mockResolvedValue({ status }),
        createPendingJob: vi.fn(),
        updatePendingJob: vi.fn(),
        touchLastSeen: vi.fn().mockResolvedValue([]),
      };

      const module = await Test.createTestingModule({
        providers: [
          {
            provide: 'TEST_REPOSITORY',
            useValue: repository,
          },
          {
            provide: IngestionService,
            inject: ['TEST_REPOSITORY'],
            useFactory: (repo: IngestionRepository) =>
              new IngestionService(repo),
          },
        ],
      }).compile();

      try {
        const service = module.get(IngestionService);

        const result = await service.ingestJobs({
          sourceId: 'fixture-source',
          jobs: [incomingJob],
        });

        expect(repository.findBySource).toHaveBeenCalledWith(
          'fixture-source',
          'fixture-001',
        );

        expect(repository.createPendingJob).not.toHaveBeenCalled();
        expect(repository.updatePendingJob).not.toHaveBeenCalled();

        expect(repository.touchLastSeen).toHaveBeenCalledExactlyOnceWith(
          'fixture-source',
          'fixture-001',
        );

        expect(result).toEqual({ received: 1 });
      } finally {
        await module.close();
      }
    },
  );
});
