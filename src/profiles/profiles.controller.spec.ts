import type { AuthenticatedUser } from '@talent-nexus/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ProfilesController } from './profiles.controller';
import type { ProfilesService } from './profiles.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.com',
  role: 'TALENT',
} as AuthenticatedUser;

describe('ProfilesController', () => {
  it('reads the profile of the logged-in user', async () => {
    const profiles = { get: vi.fn(() => Promise.resolve('profile')) };
    const controller = new ProfilesController(
      profiles as unknown as ProfilesService,
    );

    await expect(controller.get(user)).resolves.toBe('profile');
    expect(profiles.get).toHaveBeenCalledWith(user.id);
  });

  it('updates the logged-in user, never an id from the body', async () => {
    const profiles = { update: vi.fn(() => Promise.resolve('profile')) };
    const controller = new ProfilesController(
      profiles as unknown as ProfilesService,
    );
    const dto = { bio: 'Accountant' };

    await controller.update(user, dto);

    expect(profiles.update).toHaveBeenCalledWith(user.id, dto);
  });
});
