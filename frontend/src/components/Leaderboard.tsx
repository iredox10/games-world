import React, { useState, useEffect } from 'react';
import { databases } from '../lib/appwrite';
import { Trophy, Medal, Award, Crown, X, TrendingUp } from 'lucide-react';
import { Query } from 'appwrite';

interface LeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
}

type SortBy = 'wins' | 'winRate' | 'gamesPlayed';

const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose, currentUserId }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('wins');

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const result = await databases.listDocuments('main', 'players', [
          Query.orderDesc('wins'),
          Query.limit(50),
        ]);

        const leaderboard: LeaderboardEntry[] = result.documents.map(doc => ({
          id: doc.$id,
          userId: doc.userId,
          username: doc.username || `Player${doc.userId.slice(0, 4)}`,
          avatar: doc.avatar || '🎮',
          wins: doc.wins || 0,
          losses: doc.losses || 0,
          gamesPlayed: doc.gamesPlayed || 0,
          winRate: doc.gamesPlayed > 0 ? Math.round((doc.wins / doc.gamesPlayed) * 100) : 0,
        }));

        setEntries(leaderboard);
      } catch (err) {
        console.error('Failed to fetch leaderboard', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [isOpen]);

  const sortedEntries = [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'wins':
        return b.wins - a.wins;
      case 'winRate':
        return b.winRate - a.winRate;
      case 'gamesPlayed':
        return b.gamesPlayed - a.gamesPlayed;
      default:
        return 0;
    }
  });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 1:
        return <Medal className="w-5 h-5 text-gray-300" />;
      case 2:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-gray-500 font-mono text-sm">#{index + 1}</span>;
    }
  };

  const getRankBg = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/30';
      case 1:
        return 'bg-gradient-to-r from-gray-400/20 to-gray-500/20 border-gray-400/30';
      case 2:
        return 'bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-600/30';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-gaming text-2xl text-white mb-1">Leaderboard</h3>
          <p className="text-gray-400 text-sm">Top players ranked by performance</p>
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { key: 'wins', label: 'Wins', icon: Trophy },
            { key: 'winRate', label: 'Win %', icon: TrendingUp },
            { key: 'gamesPlayed', label: 'Games', icon: Award },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSortBy(key as SortBy)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                sortBy === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Leaderboard List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : sortedEntries.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No players yet. Be the first!
            </div>
          ) : (
            sortedEntries.map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${getRankBg(index)} ${
                  entry.userId === currentUserId ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                {/* Rank */}
                <div className="w-8 flex items-center justify-center">
                  {getRankIcon(index)}
                </div>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-xl">
                  {entry.avatar}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate flex items-center gap-2">
                    {entry.username}
                    {entry.userId === currentUserId && (
                      <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">You</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {entry.gamesPlayed} games played
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="font-bold text-white">
                    {sortBy === 'winRate' ? `${entry.winRate}%` : sortBy === 'gamesPlayed' ? entry.gamesPlayed : entry.wins}
                  </div>
                  <div className="text-xs text-gray-500">
                    {sortBy === 'winRate' ? 'Win Rate' : sortBy === 'gamesPlayed' ? 'Games' : 'Wins'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
