import React, { useState, useEffect } from 'react';
import { databases } from '../lib/appwrite';
import { History, Trophy, X as XIcon, Circle, Grid3X3, Hand, Minus, Coins, Target, Clock } from 'lucide-react';
import { Query } from 'appwrite';

interface GameHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onReplayGame?: (gameId: string) => void;
}

interface GameRecord {
  id: string;
  gameType: string;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  date: string;
}

const GAME_ICONS: Record<string, React.ElementType> = {
  ttt: Grid3X3,
  c4: Circle,
  rps: Hand,
  nim: Minus,
  coin: Coins,
  guess: Target,
};

const GAME_NAMES: Record<string, string> = {
  ttt: 'Tic-Tac-Toe',
  c4: 'Connect Four',
  rps: 'Rock Paper Scissors',
  nim: 'Nim',
  coin: 'Coin Flip',
  guess: 'Number Guess',
};

const GameHistory: React.FC<GameHistoryProps> = ({ isOpen, onClose, userId, onReplayGame }) => {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchHistory = async () => {
      setLoading(true);
      try {
        // Fetch games where user was playerX or playerO and game is finished
        const result = await databases.listDocuments('main', 'games', [
          Query.equal('status', 'finished'),
          Query.orderDesc('$createdAt'),
          Query.limit(50),
        ]);

        const history: GameRecord[] = result.documents
          .filter(doc => doc.playerX === userId || doc.playerO === userId)
          .map(doc => {
            // Determine game type from board
            let gameType = 'ttt';
            try {
              const board = JSON.parse(doc.board);
              if (board.t) gameType = board.t;
            } catch {}

            // Determine result
            let result: 'win' | 'loss' | 'draw' = 'draw';
            if (doc.winner === 'draw') {
              result = 'draw';
            } else if (doc.winner === userId) {
              result = 'win';
            } else if (doc.winner) {
              result = 'loss';
            }

            // Get opponent
            const opponent = doc.playerX === userId ? doc.playerO : doc.playerX;
            const isSinglePlayer = opponent?.includes('-O');

            return {
              id: doc.$id,
              gameType,
              opponent: isSinglePlayer ? 'AI' : (opponent?.slice(0, 8) || 'Unknown'),
              result,
              date: doc.$createdAt,
            };
          });

        setGames(history);
      } catch (err) {
        console.error('Failed to fetch history', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, userId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const getResultStyle = (result: 'win' | 'loss' | 'draw') => {
    switch (result) {
      case 'win':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'loss':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'draw':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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
          <XIcon className="w-4 h-4 text-gray-400" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-gaming text-2xl text-white mb-1">Game History</h3>
          <p className="text-gray-400 text-sm">Your recent matches</p>
        </div>

        {/* Stats Summary */}
        {!loading && games.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="glass rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {games.filter(g => g.result === 'win').length}
              </div>
              <div className="text-xs text-gray-500">Wins</div>
            </div>
            <div className="glass rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-red-400">
                {games.filter(g => g.result === 'loss').length}
              </div>
              <div className="text-xs text-gray-500">Losses</div>
            </div>
            <div className="glass rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-gray-400">
                {games.filter(g => g.result === 'draw').length}
              </div>
              <div className="text-xs text-gray-500">Draws</div>
            </div>
          </div>
        )}

        {/* Games List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No games played yet</p>
              <p className="text-sm">Start playing to see your history!</p>
            </div>
          ) : (
            games.map((game) => {
              const GameIcon = GAME_ICONS[game.gameType] || Grid3X3;
              
              return (
                <div
                  key={game.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-white/5 cursor-pointer ${getResultStyle(game.result)}`}
                  onClick={() => onReplayGame?.(game.id)}
                >
                  {/* Game Icon */}
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <GameIcon className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">
                      {GAME_NAMES[game.gameType] || 'Unknown Game'}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>vs {game.opponent}</span>
                      <span>•</span>
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(game.date)}</span>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="text-right">
                    <div className={`font-bold uppercase text-sm ${
                      game.result === 'win' ? 'text-green-400' :
                      game.result === 'loss' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {game.result === 'win' && <Trophy className="w-4 h-4 inline mr-1" />}
                      {game.result}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default GameHistory;
