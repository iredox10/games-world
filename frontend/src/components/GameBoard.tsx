import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { X, Circle, Home, Grid3X3 } from 'lucide-react';
import GameChat from './GameChat';

interface GameBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

// Helper to parse board data (handles compact and old formats)
const parseBoardData = (boardStr: string): string[] => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format: {t:'ttt', d:[...]}
    if (parsed.t === 'ttt' && parsed.d) {
      return parsed.d;
    }
    // Old format with type/data
    if (parsed.type && parsed.data) {
      return parsed.data;
    }
    // Plain array format
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return Array(9).fill("");
  } catch {
    return Array(9).fill("");
  }
};

// Helper to serialize board data
const serializeBoardData = (boardStr: string, newData: string[]): string => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format
    if (parsed.t === 'ttt') {
      return JSON.stringify({ t: 'ttt', d: newData });
    }
    // Old format
    if (parsed.type && parsed.data) {
      return JSON.stringify({ type: parsed.type, data: newData });
    }
    return JSON.stringify(newData);
  } catch {
    return JSON.stringify(newData);
  }
};

const GameBoard: React.FC<GameBoardProps> = ({ gameId, userId, onQuit }) => {
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

    // Subscribe to realtime updates
    const unsubscribe = client.subscribe(
      [`databases.main.collections.games.documents.${gameId}`],
      (response) => {
        console.log("Realtime update received:", response.payload);
        setGame(response.payload);
      }
    );

    return () => unsubscribe();
  }, [gameId, onQuit]);

  const makeMove = async (index: number) => {
    if (moving || game.status !== 'playing') return;
    
    // Check if it's a single-player game (playerO ends with '-O' suffix of current user)
    const isSinglePlayer = game.playerO === `${userId}-O`;
    
    // In multiplayer, check if it's user's turn
    if (!isSinglePlayer && game.turn !== userId) return;

    console.log(`Making move at index ${index} for user ${userId}`);
    setMoving(true);
    try {
      // Update the game directly in the database
      const board = parseBoardData(game.board);
      if (board[index] !== "") {
        setMoving(false);
        return;
      }
      
      const currentPlayer = game.turn === game.playerX ? 'X' : 'O';
      board[index] = currentPlayer;
      
      // Check winner
      const winnerSymbol = checkWinner(board);
      let winner = null;
      let status = 'playing';
      
      if (winnerSymbol) {
        winner = winnerSymbol === 'X' ? game.playerX : game.playerO;
        status = 'finished';
      } else if (!board.includes("")) {
        winner = 'draw';
        status = 'finished';
      }
      
      const nextTurn = game.turn === game.playerX ? game.playerO : game.playerX;
      
      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(game.board, board),
        turn: nextTurn,
        winner: winner,
        status: status,
      });
      // Realtime will update the UI
    } catch (err) {
      console.error("Move failed", err);
    } finally {
      setMoving(false);
    }
  };
  
  // Helper function for single-player mode
  const checkWinner = (board: string[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!game) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-gray-400">Game not found.</p>
      </div>
    );
  }

  const board = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isMyTurn = isSinglePlayer || game.turn === userId;
  const currentSymbol = game.turn === game.playerX ? 'X' : 'O';

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Grid3X3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Tic-Tac-Toe</h3>
            <p className="text-xs text-gray-500 font-mono">{game.$id.slice(0, 8)}...</p>
          </div>
        </div>
        <button 
          onClick={onQuit}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors group"
          title="Back to Lobby"
        >
          <Home size={18} className="text-gray-400 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Status */}
      <div className="text-center py-2">
        {game.status === 'waiting' ? (
          <div className="flex items-center gap-3 px-6 py-3 rounded-full glass">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-yellow-400 font-medium">Waiting for opponent...</span>
          </div>
        ) : game.status === 'finished' ? (
          <div className={`px-6 py-3 rounded-full ${game.winner === 'draw' ? 'bg-gray-500/20' : game.winner === userId ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <span className={`text-xl font-bold ${game.winner === 'draw' ? 'text-gray-300' : game.winner === userId ? 'text-green-400' : 'text-red-400'}`}>
              {game.winner === 'draw' ? "It's a Draw!" : game.winner === userId ? "🎉 You Won!" : "You Lost"}
            </span>
          </div>
        ) : (
          <div className={`px-6 py-3 rounded-full ${isMyTurn ? 'bg-indigo-500/20 glow-blue' : 'glass'}`}>
            <span className={`font-semibold ${isMyTurn ? 'text-indigo-400' : 'text-gray-400'}`}>
              {isSinglePlayer ? `${currentSymbol}'s Turn` : (isMyTurn ? "Your Turn" : "Opponent's Turn")}
            </span>
          </div>
        )}
      </div>

      {/* Game Board */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-3xl blur-xl" />
        <div className="relative glass rounded-3xl p-4">
          <div className="grid grid-cols-3 gap-2">
            {board.map((cell: string, i: number) => (
              <button
                key={i}
                onClick={() => makeMove(i)}
                disabled={moving || cell !== "" || game.status !== 'playing' || !isMyTurn}
                className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center transition-all duration-200
                  ${cell === "" && isMyTurn && game.status === 'playing' 
                    ? 'bg-white/5 hover:bg-white/10 hover:scale-105 cursor-pointer' 
                    : 'bg-white/5 cursor-default'}
                  ${cell === 'X' ? 'bg-blue-500/10' : cell === 'O' ? 'bg-red-500/10' : ''}
                `}
              >
                {cell === 'X' && <X size={48} strokeWidth={3} className="text-blue-400 drop-shadow-lg" />}
                {cell === 'O' && <Circle size={40} strokeWidth={3} className="text-red-400 drop-shadow-lg" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="flex gap-4 w-full">
        <div className={`flex-1 glass rounded-xl p-4 transition-all ${game.turn === game.playerX && game.status === 'playing' ? 'ring-2 ring-blue-500/50 glow-blue' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center font-bold text-white">
              X
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">
                {game.playerX === userId ? 'You' : (isSinglePlayer ? 'Player' : 'Opponent')}
              </div>
              <div className="text-xs text-gray-500 font-mono truncate">{game.playerX.slice(0, 8)}...</div>
            </div>
          </div>
        </div>
        <div className={`flex-1 glass rounded-xl p-4 transition-all ${game.turn === game.playerO && game.status === 'playing' ? 'ring-2 ring-red-500/50 glow-red' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center font-bold text-white">
              O
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">
                {game.playerO === userId ? 'You' : (isSinglePlayer ? 'AI' : (game.playerO ? 'Opponent' : 'Waiting...'))}
              </div>
              <div className="text-xs text-gray-500 font-mono truncate">{game.playerO?.slice(0, 8) || '—'}...</div>
            </div>
          </div>
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

export default GameBoard;
