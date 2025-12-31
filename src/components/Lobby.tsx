import React, { useState } from 'react';
import { databases, ID, Permission, Role } from '../lib/appwrite';
import { type GameType } from './GameSelector';
import { ScanLine, WifiOff } from 'lucide-react';
import QRScanner from './QRScanner';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface LobbyProps {
  gameType: GameType;
  onJoinGame: (id: string) => void;
  onBack: () => void;
  userId: string;
}

const gameNames: Record<GameType, string> = {
  tictactoe: 'Tic-Tac-Toe',
  connect4: 'Connect Four',
  rps: 'Rock Paper Scissors',
  nim: 'Nim',
  guess: 'Number Guess',
  reversi: 'Reversi',
  go: 'Go 9x9',
  mancala: 'Mancala',
  dots: 'Dots & Boxes',
};

const Lobby: React.FC<LobbyProps> = ({ gameType, onJoinGame, onBack, userId }) => {
  const [joinId, setJoinId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const isOnline = useOnlineStatus();

  const getInitialBoard = (gameType: GameType) => {
    switch (gameType) {
      case 'tictactoe':
        return JSON.stringify({t:'ttt',d:Array(9).fill("")});
      case 'connect4':
        return JSON.stringify({t:'c4',d:Array(42).fill("").join(",")});
      case 'rps':
        return JSON.stringify({t:'rps',d:{p1:null,p2:null,s1:0,s2:0,r:0,w:null}});
      case 'nim':
        return JSON.stringify({t:'nim',d:15});
      case 'guess':
        const secretNum = Math.floor(Math.random() * 10) + 1;
        return JSON.stringify({t:'guess',d:{n:secretNum,g1:null,g2:null,s1:0,s2:0,rd:0,w:null}});
      case 'reversi': {
        // 8x8 board, center 4 pieces: W at (3,3) and (4,4), B at (3,4) and (4,3)
        const board = Array(64).fill('');
        board[27] = 'W'; board[28] = 'B'; // row 3: cols 3,4
        board[35] = 'B'; board[36] = 'W'; // row 4: cols 3,4
        return JSON.stringify({t:'reversi',d:board.join(',')});
      }
      case 'go':
        // Compact: b=board (only non-empty), c=captures, p=passes
        return JSON.stringify({t:'go',d:{b:'',c:[0,0],p:0}});
      case 'mancala':
        // 12 pits with 4 stones each, 2 stores at 0
        return JSON.stringify({t:'mancala',d:{pits:[4,4,4,4,4,4,4,4,4,4,4,4],stores:[0,0]}});
      case 'dots': {
        // Compact: h=horizontal lines, v=vertical lines, s=scores
        // Empty strings mean no lines drawn yet
        return JSON.stringify({t:'dots',d:{h:'',v:'',s:[0,0]}});
      }
      default:
        return JSON.stringify({t:'ttt',d:Array(9).fill("")});
    }
  };

  const createGame = async (singlePlayer = false) => {
    setLoading(true);
    try {
      const board = getInitialBoard(gameType);
      const game = await databases.createDocument(
        'main',
        'games',
        ID.unique(),
        {
          board: board,
          playerX: userId,
          playerO: singlePlayer ? `${userId}-O` : undefined,
          turn: userId,
          status: singlePlayer ? 'playing' : 'waiting',
        },
        [
          Permission.read(Role.any()),
          Permission.update(Role.any()),
        ]
      );
      onJoinGame(game.$id);
    } catch (err) {
      console.error("Failed to create game", err);
      alert("Failed to create game");
    } finally {
      setLoading(false);
    }
  };

  const joinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinId) return;
    setLoading(true);
    try {
      const game = await databases.getDocument('main', 'games', joinId);
      
      if (game.status === 'waiting' && game.playerX !== userId) {
        await databases.updateDocument('main', 'games', joinId, {
          playerO: userId,
          status: 'playing',
        });
      }
      onJoinGame(joinId);
    } catch (err) {
      console.error("Failed to join game", err);
      alert("Game not found or failed to join");
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = async (scannedGameId: string) => {
    setLoading(true);
    try {
      const game = await databases.getDocument('main', 'games', scannedGameId);
      
      if (game.status === 'waiting' && game.playerX !== userId) {
        await databases.updateDocument('main', 'games', scannedGameId, {
          playerO: userId,
          status: 'playing',
        });
      }
      onJoinGame(scannedGameId);
    } catch (err) {
      console.error("Failed to join game from QR", err);
      alert("Game not found or failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-lg">
      {/* Back button */}
      <button
        onClick={onBack}
        className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors self-start"
      >
        <div className="w-8 h-8 rounded-full glass flex items-center justify-center group-hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <span className="text-sm">Back to games</span>
      </button>
      
      {/* Game title */}
      <div className="text-center">
        <h2 className="font-gaming text-3xl font-bold gradient-text mb-2">{gameNames[gameType]}</h2>
        <p className="text-gray-500 text-sm">Choose how you want to play</p>
      </div>

      {/* Host section */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Create Game</h3>
            <p className="text-xs text-gray-500">Host a new match</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => createGame(false)}
            disabled={loading || !isOnline}
            className="group relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={!isOnline ? 'Multiplayer requires internet connection' : ''}
          >
            <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100" />
            <div className="relative flex flex-col items-center gap-2">
              {!isOnline ? (
                <WifiOff className="w-8 h-8 text-white/50" />
              ) : (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              )}
              <span className="font-semibold text-white text-sm">Multiplayer</span>
              <span className="text-xs text-white/70">{!isOnline ? 'Offline' : 'Play with friends'}</span>
            </div>
          </button>
          
          <button
            onClick={() => createGame(true)}
            disabled={loading}
            className="group relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100" />
            <div className="relative flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold text-white text-sm">Solo</span>
              <span className="text-xs text-white/70">Play vs AI</span>
            </div>
          </button>
        </div>
        
        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Creating game...
          </div>
        )}
      </div>

      {/* Join section */}
      {isOnline ? (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Join Game</h3>
                <p className="text-xs text-gray-500">Enter code or scan QR</p>
              </div>
            </div>
            {/* Scan QR button */}
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium transition-all"
              title="Scan QR Code"
            >
              <ScanLine className="w-5 h-5" />
              <span className="hidden sm:inline text-sm">Scan QR</span>
            </button>
          </div>
          
          <form onSubmit={joinGame} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Enter Game ID"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
              />
              {joinId && (
                <button
                  type="button"
                  onClick={() => setJoinId('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !joinId}
              className="w-full relative overflow-hidden rounded-xl py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100" />
              <span className="relative">{loading ? 'Joining...' : 'Join Game'}</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="glass-dark rounded-2xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <WifiOff className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Offline Mode</h3>
            <p className="text-sm text-gray-400">
              You're offline. Play Solo vs AI - multiplayer and joining games requires an internet connection.
            </p>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScan}
      />
      
      {/* Tips */}
      <div className="glass-dark rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-gray-400">
            {isOnline ? (
              <>
                <span className="text-white font-medium">Tip:</span> Create a multiplayer game and share the Game ID with your friend to play together in real-time!
              </>
            ) : (
              <>
                <span className="text-white font-medium">Offline Mode:</span> Your progress in solo games will be saved locally. Reconnect to access multiplayer features.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
