import type { UserSyncItem } from './sync-service.js';
import { prisma } from '../core/prisma.js';

/** Persist or update users in the local database. */
export async function upsertUsers(users: UserSyncItem[]): Promise<void> {
  if (!users.length) return;
  await prisma.$transaction(
    users.map((u) =>
      prisma.user.upsert({
        where: { userId: u.userId },
        update: { name: u.name, citizenIdNo: u.citizenIdNo },
        create: {
          userId: u.userId,
          name: u.name,
          citizenIdNo: u.citizenIdNo,
        },
      }),
    ),
  );
}
