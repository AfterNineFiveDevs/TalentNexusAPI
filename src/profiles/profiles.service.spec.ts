import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type {
  ProfileRow,
  ProfileRowChanges,
  ProfilesRepository,
  ProfilesStoreApi,
  ProfileUserRow,
} from './profiles.repository';
import { ProfilesService } from './profiles.service';

const userId = '00000000-0000-4000-8000-000000000001';
const created = '2026-01-01T00:00:00.000Z';
const later = '2026-02-01T00:00:00.000Z';

/** In-memory copy of the user and profile tables. */
class FakeProfilesStore implements ProfilesStoreApi {
  users = new Map<string, ProfileUserRow>();
  profiles = new Map<string, ProfileRow>();
  failNextCreate = false;

  findUser(id: string) {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  findProfile(id: string) {
    return Promise.resolve(this.profiles.get(id) ?? null);
  }
  createProfile(id: string, changes: ProfileRowChanges) {
    if (this.failNextCreate) {
      // Simulates the other request winning the unique userId race.
      this.failNextCreate = false;
      this.profiles.set(id, {
        phone: null,
        bio: 'from other request',
        photo: null,
        updatedAt: later,
      });
      return Promise.reject(new Error('unique violation'));
    }
    const row: ProfileRow = {
      phone: changes.phone ?? null,
      bio: changes.bio ?? null,
      photo: changes.photo ?? null,
      updatedAt: later,
    };
    this.profiles.set(id, row);
    return Promise.resolve(row);
  }
  updateProfile(id: string, changes: ProfileRowChanges) {
    const current = this.profiles.get(id);
    if (!current) return Promise.resolve(null);
    const row = { ...current, ...changes, updatedAt: later };
    this.profiles.set(id, row);
    return Promise.resolve(row);
  }
  updateUserName(id: string, name: string) {
    const current = this.users.get(id);
    if (!current) return Promise.resolve(null);
    const row = { ...current, name, updatedAt: later };
    this.users.set(id, row);
    return Promise.resolve(row);
  }
  transaction<T>(operation: (store: ProfilesStoreApi) => Promise<T>) {
    return operation(this);
  }
}

function setup(role: ProfileUserRow['role'] = 'TALENT') {
  const store = new FakeProfilesStore();
  store.users.set(userId, {
    id: userId,
    email: 'person@example.com',
    name: null,
    role,
    updatedAt: created,
  });
  const service = new ProfilesService(store as unknown as ProfilesRepository);
  return { service, store };
}

describe('ProfilesService', () => {
  it('returns an empty profile without creating a row', async () => {
    const { service, store } = setup();

    await expect(service.get(userId)).resolves.toEqual({
      userId,
      email: 'person@example.com',
      name: null,
      phone: null,
      bio: null,
      photoUrl: null,
      completeness: {
        percent: 0,
        missing: ['name', 'phone', 'bio', 'photoUrl'],
      },
      updatedAt: created,
    });
    expect(store.profiles.size).toBe(0);
  });

  it('creates the profile row on the first update', async () => {
    const { service, store } = setup();

    const profile = await service.update(userId, {
      phone: '+95 9 123 456',
      bio: 'Accountant',
    });

    expect(profile).toMatchObject({
      phone: '+95 9 123 456',
      bio: 'Accountant',
      completeness: { percent: 50, missing: ['name', 'photoUrl'] },
      updatedAt: later,
    });
    expect(store.profiles.get(userId)).toMatchObject({ bio: 'Accountant' });
  });

  it('changes only the fields that were sent', async () => {
    const { service } = setup();
    await service.update(userId, { phone: '+95 9 123 456', bio: 'Accountant' });

    const profile = await service.update(userId, { bio: 'Senior accountant' });

    expect(profile).toMatchObject({
      phone: '+95 9 123 456',
      bio: 'Senior accountant',
    });
  });

  it('clears a field with null or an empty string', async () => {
    const { service } = setup();
    await service.update(userId, { phone: '+95 9 123 456', bio: 'Accountant' });

    const profile = await service.update(userId, { phone: '', bio: null });

    expect(profile).toMatchObject({ phone: null, bio: null });
  });

  it('saves name on the user and photoUrl on the profile', async () => {
    const { service, store } = setup();

    const profile = await service.update(userId, {
      name: 'Aye Aye',
      photoUrl: 'https://cdn.example.com/a.png',
    });

    expect(store.users.get(userId)?.name).toBe('Aye Aye');
    expect(store.profiles.get(userId)?.photo).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(profile).toMatchObject({
      name: 'Aye Aye',
      photoUrl: 'https://cdn.example.com/a.png',
    });
  });

  it('does not create a profile row when only the name changes', async () => {
    const { service, store } = setup();

    await service.update(userId, { name: 'Aye Aye' });

    expect(store.profiles.size).toBe(0);
  });

  it('retries once when another request created the row first', async () => {
    const { service, store } = setup();
    store.failNextCreate = true;

    const profile = await service.update(userId, { phone: '+95 9 123 456' });

    expect(profile).toMatchObject({
      phone: '+95 9 123 456',
      bio: 'from other request',
    });
  });

  it('rejects accounts that are not candidates', async () => {
    const { service } = setup('ADMIN');

    await expect(service.get(userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.update(userId, { bio: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an unknown user', async () => {
    const { service } = setup();

    await expect(
      service.get('99999999-9999-4999-8999-999999999999'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
