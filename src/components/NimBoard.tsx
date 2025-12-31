import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Minus, Share2 } from 'lucide-react';
import GameChat from './GameChat';
import GameControls from './GameControls';
import GameShare from './GameShare';
import { updatePlayerStats } from '../utils/playerStats';
import { useSounds } from '../hooks/useSounds';

interface NimBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

// Nim: Remove 1-3 sticks, whoever takes the last stick loses

// Helper to parse board data
const parseBoardData = (boardStr: string): number => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'nim' && typeof parsed.d === 'number') {
      return parsed.d;
    }
    return 15;
  } catch {
    return 15;
  }
};

// Helper to serialize board data
const serializeBoardData = (sticks: number): string => {
  return JSON.stringify({ t: 'nim', d: sticks });
};

const NimBoard: React.FC<NimBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const statsUpdated = useRef(false);
  const { play } = useSounds();

  const fetchGame = async () => {
    try {
      const doc = await databases.getDocument('main', 'games', gameId);
      setGame(doc);
    } catch (err) {
      console.error("Failed to fetch game", err);
      onQuit();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGame();

    const unsubscribe = client.subscribe(
      [`databases.main.collections.games.documents.${gameId}`],
      (response) => {
        setGame(response.payload);
      }
    );

    return () => unsubscribe();
  }, [gameId, onQuit]);

  // Update player stats when game finishes
  useEffect(() => {
    if (!game || game.status !== 'finished' || statsUpdated.current) return;
    
    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (isSinglePlayer) return;
    
    statsUpdated.current = true;
    
    if (game.winner === userId) {
      play('win');
      updatePlayerStats(userId, 'win');
    } else {
      play('lose');
      updatePlayerStats(userId, 'loss');
    }
  }, [game, userId, play]);

  // Check if game is paused
  const isPaused = game?.controls ? JSON.parse(game.controls).isPaused : false;

  const handleRestart = async () => {
    statsUpdated.current = false;
    try {
      const newBoard = serializeBoardData(15);
      await databases.updateDocument('main', 'games', gameId, {
        board: newBoard,
        turn: game.playerX,
        winner: null,
        status: 'playing',
        controls: JSON.stringify({ isPaused: false, pausedBy: null, rematchRequested: null, startTime: Date.now() }),
      });
    } catch (err) {
      console.error("Failed to restart game", err);
    }
  };

  const takeSticks = async (count: number) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (!isSinglePlayer && game.turn !== userId) return;

    const sticks = parseBoardData(game.board);
    if (count > sticks) return;

    play('move');
    setMoving(true);
    try {
      const newSticks = sticks - count;
      let winner = null;
      let status = 'playing';
      let nextTurn = game.turn === game.playerX ? game.playerO : game.playerX;

      // If player takes the last stick, they lose
      if (newSticks === 0) {
        winner = game.turn === game.playerX ? game.playerO : game.playerX;
        status = 'finished';
      }

      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(newSticks),
        turn: nextTurn,
        winner: winner,
        status: status,
      });

      // AI move in single player
      if (isSinglePlayer && status === 'playing' && newSticks > 0) {
        setTimeout(async () => {
          // AI strategy: try to leave (n-1) % 4 = 0 sticks
          let aiTake = 1;
          const remainder = (newSticks - 1) % 4;
          if (remainder > 0 && remainder <= 3) {
            aiTake = remainder;
          } else {
            aiTake = Math.min(3, Math.max(1, Math.floor(Math.random() * 3) + 1));
          }
          aiTake = Math.min(aiTake, newSticks);

          const afterAI = newSticks - aiTake;
          let aiWinner = null;
          let aiStatus = 'playing';

          if (afterAI === 0) {
            aiWinner = game.playerX; // AI took last, player wins
            aiStatus = 'finished';
          }

          await databases.updateDocument('main', 'games', gameId, {
            board: serializeBoardData(afterAI),
            turn: game.playerX,
            winner: aiWinner,
            status: aiStatus,
          });
        }, 800);
      }
    } catch (err) {
      console.error("Move failed", err);
    } finally {
      setMoving(false);
    }
  };

  if (loading) return <div>Loading Game...</div>;
  if (!game) return <div>Game not found.</div>;

  const sticks = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Minus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Nim</h3>
            <p className="text-xs text-gray-500 font-mono">{game.$id.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {game.status === 'waiting' && (
            <button 
              onClick={() => setShowShare(true)}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center hover:scale-105 transition-all"
              title="Invite Friend"
            >
              <Share2 size={18} className="text-white" />
            </button>
          )}
          <button 
            onClick={onQuit}
            className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors group"
            title="Back to Lobby"
          >
            <Home size={18} className="text-gray-400 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* Share Modal */}
      <GameShare
        gameId={gameId}
        gameName="Nim"
        isOpen={showShare}
        onClose={() => setShowShare(false)}
      />

      {/* Game Controls */}
      <GameControls
        gameId={gameId}
        userId={userId}
        game={game}
        isSinglePlayer={isSinglePlayer}
        onRestart={handleRestart}
      />

      {/* Info */}
      <div className="text-gray-500 text-sm text-center">Take 1-3 sticks. Don't take the last one!</div>

      {/* Status */}
      <div className="text-center py-2">
        {game.status === 'waiting' ? (
          <div className="flex items-center gap-3 px-6 py-3 rounded-full glass">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-yellow-400 font-medium">Waiting for opponent...</span>
          </div>
        ) : game.status === 'finished' ? (
          <div className={`px-6 py-3 rounded-full ${game.winner === userId ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <span className={`text-xl font-bold ${game.winner === userId ? 'text-green-400' : 'text-red-400'}`}>
              {game.winner === userId ? "You Won! 🎉" : "You Lost!"}
            </span>
          </div>
        ) : (
          <div className={`px-6 py-3 rounded-full ${isMyTurn ? 'bg-indigo-500/20' : 'bg-gray-500/20'}`}>
            <span className={`font-semibold ${isMyTurn ? 'text-indigo-400' : 'text-gray-400'}`}>
              {isMyTurn ? "Your Turn" : (isSinglePlayer ? "AI Thinking..." : "Opponent's Turn")}
            </span>
          </div>
        )}
      </div>

      {/* Sticks display */}
      <div className="glass p-6 rounded-xl">
        <div className="flex flex-wrap justify-center gap-2 max-w-xs">
          {Array.from({ length: sticks }).map((_, i) => (
            <div key={i} className="w-2 h-16 bg-gradient-to-b from-amber-500 to-amber-700 rounded-full shadow-lg" />
          ))}
        </div>
        <div className="text-center mt-4 text-2xl font-bold text-amber-500">
          {sticks} sticks remaining
        </div>
      </div>

      {/* Action buttons */}
      {game.status === 'playing' && isMyTurn && (
        <div className="flex gap-4">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              onClick={() => takeSticks(count)}
              disabled={moving || count > sticks}
              className="w-16 h-16 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:opacity-50 rounded-xl flex flex-col items-center justify-center transition-all"
            >
              <Minus size={20} />
              <span className="text-sm font-bold">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-4 w-full text-sm">
        <div className={`flex-1 p-3 rounded-lg border ${game.playerX === userId ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">Player 1</div>
          <div className="truncate font-mono text-xs">{game.playerX}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${game.playerO === userId ? 'border-red-500 bg-red-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">{isSinglePlayer ? 'AI' : 'Player 2'}</div>
          <div className="truncate font-mono text-xs">{game.playerO || 'Waiting...'}</div>
        </div>
      </div>

      {/* Chat */}
      <GameChat
        gameId={gameId}
        userId={userId}
        opponentId={game.playerO && game.playerO !== `${userId}-O` ? game.playerO : null}
        isSinglePlayer={isSinglePlayer}
      />
    </div>
  );
};

export default NimBoard;
