import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  jobContentSchema,
  type AdminJobActionRequest,
  type AdminJobDetail,
  type AdminJobReasonRequest,
  type AdminJobsQuery,
  type CreateAdminJobRequest,
  type JobAdminAction,
  type PublishAdminJobRequest,
  type UpdateAdminJobRequest,
} from '@talent-nexus/contracts';
import { paginated } from '../common/http/api-response.factory';
import { JobsRepository, type JobRow, type JobWrite } from './jobs.repository';

@Injectable()
export class JobsService {
  constructor(private readonly repository: JobsRepository) {}

  async findMany(query: AdminJobsQuery) {
    const { items, total } = await this.repository.findMany(query);
    const totalPages = Math.ceil(total / query.limit);
    return paginated(items, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    });
  }

  async findById(id: string): Promise<AdminJobDetail> {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async create(
    input: CreateAdminJobRequest,
    actorId: string,
  ): Promise<AdminJobDetail> {
    const { note, ...content } = input;
    return this.repository.createManual(content, actorId, note);
  }

  edit(id: string, input: UpdateAdminJobRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'EDIT', (job, now) => ({
      ...input.content,
      adminEditedAt: now,
    }));
  }

  publish(id: string, input: PublishAdminJobRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'PUBLISH', (job, now) => {
      this.requireStatus(job, ['PENDING']);
      const content = jobContentSchema.safeParse({
        title: job.title,
        companyName: job.companyName,
        description: job.description,
        location: job.location,
        sourceUrl: job.sourceUrl,
        applicationUrl: job.applicationUrl,
        ...input.content,
      });
      if (!content.success) {
        throw new BadRequestException(
          'Job requires valid content and an HTTP(S) source destination before publication',
        );
      }
      return {
        ...content.data,
        status: 'PUBLISHED',
        publishedAt: job.publishedAt ?? now,
        reviewedById: actorId,
        reviewedAt: now,
        reviewNote: input.note ?? null,
        ...(input.content ? { adminEditedAt: now } : {}),
      };
    });
  }

  reject(id: string, input: AdminJobReasonRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'REJECT', (job, now) => {
      this.requireStatus(job, ['PENDING']);
      return {
        status: 'REJECTED',
        reviewedById: actorId,
        reviewedAt: now,
        reviewNote: input.note,
      };
    });
  }

  close(id: string, input: AdminJobActionRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'CLOSE', (job, now) => {
      this.requireStatus(job, ['PUBLISHED']);
      return { status: 'CLOSED', closedAt: now };
    });
  }

  reopen(id: string, input: AdminJobActionRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'REOPEN', (job, now) => {
      this.requireStatus(job, ['REJECTED', 'CLOSED']);
      return { status: 'PENDING', closedAt: null, adminEditedAt: now };
    });
  }

  delete(id: string, input: AdminJobReasonRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'DELETE', (_job, now) => ({
      deletedAt: now,
    }));
  }

  restore(id: string, input: AdminJobActionRequest, actorId: string) {
    return this.mutate(id, input, actorId, 'RESTORE', (_job, now) => ({
      deletedAt: null,
      status: 'PENDING',
      closedAt: null,
      adminEditedAt: now,
    }));
  }

  private requireStatus(job: JobRow, statuses: JobRow['status'][]) {
    if (!statuses.includes(job.status))
      throw new ConflictException(
        `Action is not allowed for a ${job.status} job`,
      );
  }

  private async mutate(
    id: string,
    input: AdminJobActionRequest,
    actorId: string,
    action: JobAdminAction,
    changes: (job: JobRow, now: string) => JobWrite,
  ): Promise<AdminJobDetail> {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    if (job.version !== input.expectedVersion)
      throw new ConflictException('Job changed; refresh before retrying');
    if ((action === 'RESTORE') !== (job.deletedAt !== null)) {
      throw new ConflictException(
        action === 'RESTORE'
          ? 'Job is not deleted'
          : 'Restore the deleted job before changing it',
      );
    }
    const now = new Date().toISOString();
    const saved = await this.repository.compareAndUpdate(job, {
      ...changes(job, now),
      lastAdminAction: action,
      lastAdminActionById: actorId,
      lastAdminActionAt: now,
      lastAdminActionNote: input.note ?? null,
    });
    if (!saved)
      throw new ConflictException('Job changed; refresh before retrying');
    return saved;
  }
}
