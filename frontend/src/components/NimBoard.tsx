import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Minus } from 'lucide-react';
import GameChat from './GameChat';

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

  useEffect(() => {
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

    fetchGame();

    const unsubscribe = client.subscribe(
      [`databases.main.collections.games.documents.${gameId}`],
      (response) => {
        setGame(response.payload);
      }
    );

    return () => unsubscribe();
  }, [gameId, onQuit]);

  const takeSticks = async (count: number) => {
    if (moving || game.status !== 'playing') return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (!isSinglePlayer && game.turn !== userId) return;

    const sticks = parseBoardData(game.board);
    if (count > sticks) return;

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
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="flex justify-between w-full items-center bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex flex-col">
          <span className="text-sm text-gray-400">Game ID</span>
          <span className="font-mono text-xs select-all">{game.$id}</span>
        </div>
        <button 
          onClick={onQuit}
          className="p-2 hover:bg-gray-700 rounded-full transition-colors"
          title="Back to Lobby"
        >
          <Home size={20} />
        </button>
      </div>

      <div className="text-center">
        <div className="text-gray-400 mb-2">Take 1-3 sticks. Don't take the last one!</div>
        {game.status === 'waiting' ? (
          <div className="animate-pulse text-yellow-500 font-semibold">
            Waiting for opponent...
          </div>
        ) : game.status === 'finished' ? (
          <div className="text-2xl font-bold text-green-500">
            {game.winner === userId ? "You Won! 🎉" : "You Lost!"}
          </div>
        ) : (
          <div className={`text-xl font-semibold ${isMyTurn ? 'text-blue-400' : 'text-gray-400'}`}>
            {isMyTurn ? "Your Turn" : (isSinglePlayer ? "AI Thinking..." : "Opponent's Turn")}
          </div>
        )}
      </div>

      {/* Sticks display */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <div className="flex flex-wrap justify-center gap-2 max-w-xs">
          {Array.from({ length: sticks }).map((_, i) => (
            <div key={i} className="w-2 h-16 bg-amber-600 rounded-full shadow-lg" />
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
