import { databases } from '../lib/appwrite';
import { Query, ID } from 'appwrite';

export interface PlayerStats {
  id?: string;
userId: string;
  username: string;
  avatar: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
}

export const getPlayerStats = async (userId: string): Promise<PlayerStats | null> => {
  try {
    const result = await databases.listDocuments('main', 'players', [
      Query.equal('userId', userId),
      Query.limit(1),
    ]);

    if (result.documents.length > 0) {
      const doc = result.documents[0];
      return {
        id: doc.$id,
        userId: doc.userId,
        username: doc.username,
        avatar: doc.avatar || '🎮',
        wins: doc.wins || 0,
        losses: doc.losses || 0,
        draws: doc.draws || 0,
        gamesPlayed: doc.gamesPlayed || 0,
      };
    }
    return null;
  } catch (err) {
    console.error('Failed to get player stats', err);
    return null;
  }
};

export const updatePlayerStats = async (
  userId: string,
  result: 'win' | 'loss' | 'draw'
): Promise<void> => {
  try {
    let stats = await getPlayerStats(userId);

    if (!stats) {
      // Create new player profile
      await databases.createDocument('main', 'players', ID.unique(), {
        userId: userId,
        username: `Player${userId.slice(0, 4)}`,
        avatar: '🎮',
        wins: result === 'win' ? 1 : 0,
        losses: result === 'loss' ? 1 : 0,
        draws: result === 'draw' ? 1 : 0,
        gamesPlayed: 1,
      });
    } else {
      // Update existing
      await databases.updateDocument('main', 'players', stats.id!, {
        wins: stats.wins + (result === 'win' ? 1 : 0),
        losses: stats.losses + (result === 'loss' ? 1 : 0),
        draws: stats.draws + (result === 'draw' ? 1 : 0),
        gamesPlayed: stats.gamesPlayed + 1,
      });
    }
  } catch (err) {
    console.error('Failed to update player stats', err);
  }
};
