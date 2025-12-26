import React, { useState, useEffect } from 'react';
import { databases } from '../lib/appwrite';
import { User, Trophy, Target, Percent, Edit2, X, Check } from 'lucide-react';
import { ID, Query } from 'appwrite';

interface PlayerProfileProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PlayerStats {
  id?: string;
  userId: string;
  username: string;
  avatar: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
}

const AVATARS = ['🎮', '👾', '🎯', '🎲', '🏆', '⭐', '🔥', '💎', '🚀', '🎪', '🎭', '🃏'];

const PlayerProfile: React.FC<PlayerProfileProps> = ({ userId, isOpen, onClose }) => {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🎮');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Try to find existing profile
        const result = await databases.listDocuments('main', 'players', [
          Query.equal('userId', userId)
        ]);

        if (result.documents.length > 0) {
          const doc = result.documents[0];
          setStats({
            id: doc.$id,
            userId: doc.userId,
            username: doc.username,
            avatar: doc.avatar || '🎮',
            wins: doc.wins || 0,
            losses: doc.losses || 0,
            draws: doc.draws || 0,
            gamesPlayed: doc.gamesPlayed || 0,
          });
          setNewUsername(doc.username);
          setSelectedAvatar(doc.avatar || '🎮');
        } else {
          // Create new profile
          const defaultUsername = `Player${userId.slice(0, 4)}`;
          setStats({
            userId,
            username: defaultUsername,
            avatar: '🎮',
            wins: 0,
            losses: 0,
            draws: 0,
            gamesPlayed: 0,
          });
          setNewUsername(defaultUsername);
          setSelectedAvatar('🎮');
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId, isOpen]);

  const saveProfile = async () => {
    if (!newUsername.trim()) return;
    
    setSaving(true);
    try {
      if (stats?.id) {
        // Update existing
        await databases.updateDocument('main', 'players', stats.id, {
          username: newUsername.trim(),
          avatar: selectedAvatar,
        });
      } else {
        // Create new
        await databases.createDocument('main', 'players', ID.unique(), {
          userId: userId,
          username: newUsername.trim(),
          avatar: selectedAvatar,
          wins: 0,
          losses: 0,
          draws: 0,
          gamesPlayed: 0,
        });
      }
      
      setStats(prev => prev ? {
        ...prev,
        username: newUsername.trim(),
        avatar: selectedAvatar,
      } : null);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save profile', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const winRate = stats && stats.gamesPlayed > 0 
    ? Math.round((stats.wins / stats.gamesPlayed) * 100) 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-6 max-w-md w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Avatar & Name */}
            <div className="text-center mb-6">
              {editing ? (
                <>
                  {/* Avatar Picker */}
                  <div className="mb-4">
                    <div className="text-6xl mb-3">{selectedAvatar}</div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {AVATARS.map(avatar => (
                        <button
                          key={avatar}
                          onClick={() => setSelectedAvatar(avatar)}
                          className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                            selectedAvatar === avatar 
                              ? 'bg-indigo-500 scale-110' 
                              : 'bg-white/10 hover:bg-white/20'
                          }`}
                        >
                          {avatar}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Username Input */}
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.slice(0, 20))}
                    placeholder="Enter username"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white text-lg font-semibold focus:outline-none focus:border-indigo-500/50 mb-4"
                    maxLength={20}
                  />
                  
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={saving || !newUsername.trim()}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? 'Saving...' : <><Check className="w-4 h-4" /> Save</>}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl mx-auto mb-3">
                    {stats?.avatar || '🎮'}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">{stats?.username}</h3>
                  <p className="text-gray-500 text-sm font-mono">{userId.slice(0, 12)}...</p>
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-2 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 text-sm transition-colors inline-flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Edit Profile
                  </button>
                </>
              )}
            </div>

            {/* Stats Grid */}
            {!editing && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="glass rounded-xl p-4 text-center">
                  <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{stats?.wins || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Wins</div>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <Target className="w-6 h-6 text-red-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{stats?.losses || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Losses</div>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <User className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{stats?.gamesPlayed || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Games</div>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <Percent className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{winRate}%</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</div>
                </div>
              </div>
            )}

            {/* Win Rate Bar */}
            {!editing && stats && stats.gamesPlayed > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Win Rate</span>
                  <span>{winRate}%</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${winRate}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlayerProfile;
