import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db';

export interface ProfileUserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'TALENT' | 'RECRUITER' | 'ADMIN';
  updatedAt: string;
}

export interface ProfileRow {
  phone: string | null;
  bio: string | null;
  photo: string | null;
  updatedAt: string;
}

export type ProfileRowChanges = Partial<
  Pick<ProfileRow, 'phone' | 'bio' | 'photo'>
>;

/** Database reads and writes for one candidate's profile. */
export interface ProfilesStoreApi {
  findUser(userId: string): Promise<ProfileUserRow | null>;
  findProfile(userId: string): Promise<ProfileRow | null>;
  createProfile(
    userId: string,
    changes: ProfileRowChanges,
  ): Promise<ProfileRow>;
  updateProfile(
    userId: string,
    changes: ProfileRowChanges,
  ): Promise<ProfileRow | null>;
  updateUserName(userId: string, name: string): Promise<ProfileUserRow | null>;
}

export class ProfilesStore implements ProfilesStoreApi {
  constructor(private readonly orm: typeof db.orm.public) {}

  findUser(userId: string) {
    return this.orm.User.where({ id: userId })
      .select('id', 'email', 'name', 'role', 'updatedAt')
      .first();
  }

  findProfile(userId: string) {
    return this.orm.Profile.where({ userId })
      .select('phone', 'bio', 'photo', 'updatedAt')
      .first();
  }

  createProfile(userId: string, changes: ProfileRowChanges) {
    return this.orm.Profile.select('phone', 'bio', 'photo', 'updatedAt').create(
      {
        userId,
        phone: changes.phone ?? null,
        bio: changes.bio ?? null,
        photo: changes.photo ?? null,
      },
    );
  }

  updateProfile(userId: string, changes: ProfileRowChanges) {
    return this.orm.Profile.where({ userId })
      .select('phone', 'bio', 'photo', 'updatedAt')
      .update(changes);
  }

  updateUserName(userId: string, name: string) {
    return this.orm.User.where({ id: userId })
      .select('id', 'email', 'name', 'role', 'updatedAt')
      .update({ name });
  }
}

@Injectable()
export class ProfilesRepository extends ProfilesStore {
  constructor() {
    super(db.orm.public);
  }

  transaction<T>(operation: (store: ProfilesStoreApi) => Promise<T>) {
    return db.transaction((tx) => operation(new ProfilesStore(tx.orm.public)));
  }
}
