import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Profile, UpdateProfileRequest } from '@talent-nexus/contracts';
import { profileCompleteness } from './profile-completeness';
import {
  ProfilesRepository,
  type ProfileRow,
  type ProfileRowChanges,
  type ProfilesStoreApi,
  type ProfileUserRow,
} from './profiles.repository';

/** Empty text means "clear this field". */
const emptyToNull = (value: string | null) => (value === '' ? null : value);

@Injectable()
export class ProfilesService {
  constructor(private readonly repository: ProfilesRepository) {}

  /** Read the profile. Does not create a row when none exists yet. */
  get(userId: string): Promise<Profile> {
    return this.repository.transaction(async (store) => {
      const user = await this.requireCandidate(store, userId);
      return this.present(user, await store.findProfile(userId));
    });
  }

  /**
   * Change only the fields that were sent.
   * Two first-time saves can race on the unique `profile.userId`; the loser's
   * transaction fails, so run it once more and it will update the winner's row.
   */
  async update(userId: string, dto: UpdateProfileRequest): Promise<Profile> {
    try {
      return await this.applyUpdate(userId, dto);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      return this.applyUpdate(userId, dto);
    }
  }

  private applyUpdate(userId: string, dto: UpdateProfileRequest) {
    return this.repository.transaction(async (store) => {
      let user = await this.requireCandidate(store, userId);

      if (dto.name !== undefined) {
        user = (await store.updateUserName(userId, dto.name)) ?? user;
      }

      const changes: ProfileRowChanges = {};
      if (dto.phone !== undefined) changes.phone = emptyToNull(dto.phone);
      if (dto.bio !== undefined) changes.bio = emptyToNull(dto.bio);
      if (dto.photoUrl !== undefined) changes.photo = dto.photoUrl;

      let profile = await store.findProfile(userId);
      if (Object.keys(changes).length > 0) {
        profile = profile
          ? await store.updateProfile(userId, changes)
          : await store.createProfile(userId, changes);
      }
      return this.present(user, profile);
    });
  }

  private async requireCandidate(
    store: ProfilesStoreApi,
    userId: string,
  ): Promise<ProfileUserRow> {
    const user = await store.findUser(userId);
    if (!user) throw new UnauthorizedException();
    if (user.role !== 'TALENT') {
      throw new ForbiddenException('Candidate account required');
    }
    return user;
  }

  private present(user: ProfileUserRow, profile: ProfileRow | null): Profile {
    const fields = {
      name: user.name,
      phone: profile?.phone ?? null,
      bio: profile?.bio ?? null,
      photoUrl: profile?.photo ?? null,
    };
    const updatedAt = Math.max(
      Date.parse(user.updatedAt),
      profile ? Date.parse(profile.updatedAt) : 0,
    );
    return {
      userId: user.id,
      email: user.email,
      ...fields,
      completeness: profileCompleteness(fields),
      updatedAt: new Date(updatedAt).toISOString(),
    };
  }
}
