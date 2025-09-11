import { logger } from '../core/logger.js';

export interface UserSyncItem {
  userId: string;
  name: string;
  citizenIdNo?: string;
  faceImageBase64?: string;
}

export async function syncUsersToAsi(users: UserSyncItem[]): Promise<void> {
  logger.info({ count: users.length }, 'syncUsersToAsi triggered');
  // TODO: implement device synchronization
}
