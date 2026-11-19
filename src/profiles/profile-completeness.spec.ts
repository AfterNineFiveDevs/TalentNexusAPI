import { describe, expect, it } from 'vitest';
import { profileCompleteness } from './profile-completeness';

const empty = { name: null, phone: null, bio: null, photoUrl: null };

describe('profileCompleteness', () => {
  it('is 0% with every field missing', () => {
    expect(profileCompleteness(empty)).toEqual({
      percent: 0,
      missing: ['name', 'phone', 'bio', 'photoUrl'],
    });
  });

  it('is 50% with two of four fields', () => {
    expect(
      profileCompleteness({ ...empty, name: 'Aye', bio: 'Accountant' }),
    ).toEqual({ percent: 50, missing: ['phone', 'photoUrl'] });
  });

  it('is 100% with every field filled', () => {
    expect(
      profileCompleteness({
        name: 'Aye',
        phone: '+95 9 123',
        bio: 'Accountant',
        photoUrl: 'https://cdn.example.com/a.png',
      }),
    ).toEqual({ percent: 100, missing: [] });
  });

  it('counts whitespace-only text as missing', () => {
    expect(profileCompleteness({ ...empty, name: '   ' }).missing).toContain(
      'name',
    );
  });
});
