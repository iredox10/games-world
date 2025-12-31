import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Share2, Circle } from 'lucide-react';
import GameChat from './GameChat';
import GameControls from './GameControls';
import GameShare from './GameShare';
import { updatePlayerStats } from '../utils/playerStats';
import { useSounds } from '../hooks/useSounds';

interface ReversiBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0], [1, 1]
];

// Helper to parse board data
const parseBoardData = (boardStr: string): string[] => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'reversi' && typeof parsed.d === 'string') {
      return parsed.d.split(',');
    }
    return createInitialBoard();
  } catch {
    return createInitialBoard();
  }
};

// Helper to serialize board data
const serializeBoardData = (board: string[]): string => {
  return JSON.stringify({ t: 'reversi', d: board.join(',') });
};

// Create initial board with 4 pieces in center
const createInitialBoard = (): string[] => {
  const board = Array(64).fill('');
  // Center pieces: White on d4,e5 and Black on d5,e4
  board[27] = 'W'; // d4
  board[28] = 'B'; // e4
  board[35] = 'B'; // d5
  board[36] = 'W'; // e5
  return board;
};

// Get valid moves for a player
const getValidMoves = (board: string[], player: string): number[] => {
  const validMoves: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (board[i] === '' && getFlippedPieces(board, i, player).length > 0) {
      validMoves.push(i);
    }
  }
  return validMoves;
};

// Get pieces that would be flipped by placing at position
const getFlippedPieces = (board: string[], pos: number, player: string): number[] => {
  const opponent = player === 'B' ? 'W' : 'B';
  const row = Math.floor(pos / 8);
  const col = pos % 8;
  const flipped: number[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = col + dc;

    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const idx = r * 8 + c;
      if (board[idx] === opponent) {
        line.push(idx);
      } else if (board[idx] === player) {
        flipped.push(...line);
        break;
      } else {
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return flipped;
};

// Count pieces
const countPieces = (board: string[]): { black: number; white: number } => {
  let black = 0, white = 0;
  for (const cell of board) {
    if (cell === 'B') black++;
    else if (cell === 'W') white++;
  }
  return { black, white };
};

const ReversiBoard: React.FC<ReversiBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [validMoves, setValidMoves] = useState<number[]>([]);
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

  // Update valid moves when game changes
  useEffect(() => {
    if (!game || game.status !== 'playing') {
      setValidMoves([]);
      return;
    }
    const board = parseBoardData(game.board);
    const isSinglePlayer = game.playerO === `${userId}-O`;
    const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
    
    if (isMyTurn) {
      const currentPlayer = game.turn === game.playerX ? 'B' : 'W';
      setValidMoves(getValidMoves(board, currentPlayer));
    } else {
      setValidMoves([]);
    }
  }, [game, userId]);

  // Update player stats when game finishes
  useEffect(() => {
    if (!game || game.status !== 'finished' || statsUpdated.current) return;
    
    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (isSinglePlayer) return;
    
    statsUpdated.current = true;
    
    if (game.winner === 'draw') {
      play('draw');
      updatePlayerStats(userId, 'draw');
    } else if (game.winner === userId) {
      play('win');
      updatePlayerStats(userId, 'win');
    } else {
      play('lose');
      updatePlayerStats(userId, 'loss');
    }
  }, [game, userId, play]);

  const isPaused = game?.controls ? JSON.parse(game.controls).isPaused : false;

  const handleRestart = async () => {
    statsUpdated.current = false;
    try {
      const newBoard = serializeBoardData(createInitialBoard());
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

  const makeMove = async (pos: number) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
    if (!isMyTurn) return;

    const board = parseBoardData(game.board);
    const currentPlayer = game.turn === game.playerX ? 'B' : 'W';
    const flipped = getFlippedPieces(board, pos, currentPlayer);

    if (flipped.length === 0) return; // Invalid move

    play('move');
    setMoving(true);

    try {
      // Apply move
      const newBoard = [...board];
      newBoard[pos] = currentPlayer;
      for (const idx of flipped) {
        newBoard[idx] = currentPlayer;
      }

      // Check for next turn
      const opponent = currentPlayer === 'B' ? 'W' : 'B';
      const opponentMoves = getValidMoves(newBoard, opponent);
      const currentMoves = getValidMoves(newBoard, currentPlayer);

      let nextTurn = game.turn === game.playerX ? game.playerO : game.playerX;
      let winner = null;
      let status = 'playing';

      if (opponentMoves.length === 0) {
        if (currentMoves.length === 0) {
          // Game over - neither can move
          const { black, white } = countPieces(newBoard);
          if (black > white) winner = game.playerX;
          else if (white > black) winner = game.playerO;
          else winner = 'draw';
          status = 'finished';
        } else {
          // Opponent can't move, current player goes again
          nextTurn = game.turn;
        }
      }

      // Check if board is full
      if (status === 'playing' && !newBoard.includes('')) {
        const { black, white } = countPieces(newBoard);
        if (black > white) winner = game.playerX;
        else if (white > black) winner = game.playerO;
        else winner = 'draw';
        status = 'finished';
      }

      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(newBoard),
        turn: nextTurn,
        winner,
        status,
      });

      // AI move in single player
      if (isSinglePlayer && status === 'playing' && nextTurn === game.playerO) {
        setTimeout(async () => {
          const aiBoard = parseBoardData(serializeBoardData(newBoard));
          const aiMoves = getValidMoves(aiBoard, 'W');
          
          if (aiMoves.length === 0) {
            // AI can't move, skip back to player
            await databases.updateDocument('main', 'games', gameId, {
              turn: game.playerX,
            });
            return;
          }

          // AI strategy: prioritize corners, then edges, then max flips
          const corners = [0, 7, 56, 63];
          const edges = [1,2,3,4,5,6, 8,16,24,32,40,48, 15,23,31,39,47,55, 57,58,59,60,61,62];
          
          let bestMove = aiMoves[0];
          let bestScore = -1;

          for (const move of aiMoves) {
            let score = getFlippedPieces(aiBoard, move, 'W').length;
            if (corners.includes(move)) score += 100;
            else if (edges.includes(move)) score += 10;
            // Avoid squares adjacent to corners if corner is empty
            const badSquares = [1,8,9, 6,14,15, 48,49,57, 54,55,62];
            if (badSquares.includes(move)) score -= 20;
            
            if (score > bestScore) {
              bestScore = score;
              bestMove = move;
            }
          }

          const aiFlipped = getFlippedPieces(aiBoard, bestMove, 'W');
          aiBoard[bestMove] = 'W';
          for (const idx of aiFlipped) {
            aiBoard[idx] = 'W';
          }

          // Check game state after AI move
          const playerMoves = getValidMoves(aiBoard, 'B');
          const aiNextMoves = getValidMoves(aiBoard, 'W');
          
          let aiNextTurn = game.playerX;
          let aiWinner = null;
          let aiStatus = 'playing';

          if (playerMoves.length === 0 && aiNextMoves.length === 0) {
            const { black, white } = countPieces(aiBoard);
            if (black > white) aiWinner = game.playerX;
            else if (white > black) aiWinner = game.playerO;
            else aiWinner = 'draw';
            aiStatus = 'finished';
          } else if (playerMoves.length === 0) {
            aiNextTurn = game.playerO; // AI goes again
          }

          if (aiStatus === 'playing' && !aiBoard.includes('')) {
            const { black, white } = countPieces(aiBoard);
            if (black > white) aiWinner = game.playerX;
            else if (white > black) aiWinner = game.playerO;
            else aiWinner = 'draw';
            aiStatus = 'finished';
          }

          await databases.updateDocument('main', 'games', gameId, {
            board: serializeBoardData(aiBoard),
            turn: aiNextTurn,
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>;
  if (!game) return <div>Game not found.</div>;

  const board = parseBoardData(game.board);
  const { black, white } = countPieces(board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
  const myColor = game.playerX === userId ? 'B' : 'W';

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center">
            <Circle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Reversi</h3>
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

      <GameShare gameId={gameId} gameName="Reversi" isOpen={showShare} onClose={() => setShowShare(false)} />
      <GameControls gameId={gameId} userId={userId} game={game} isSinglePlayer={isSinglePlayer} onRestart={handleRestart} />

      {/* Score */}
      <div className="flex justify-center gap-8 glass rounded-xl p-4">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full bg-gray-900 border-2 border-gray-700 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{black}</div>
          <div className="text-xs text-gray-500">Black {myColor === 'B' ? '(You)' : ''}</div>
        </div>
        <div className="text-gray-600 text-2xl font-bold self-center">vs</div>
        <div className="text-center">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-300 mx-auto mb-1" />
          <div className="text-2xl font-bold text-white">{white}</div>
          <div className="text-xs text-gray-500">White {myColor === 'W' ? '(You)' : ''}</div>
        </div>
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
              {game.winner === 'draw' ? "It's a Draw!" : game.winner === userId ? "You Won!" : "You Lost!"}
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

      {/* Board */}
      <div className="bg-gradient-to-br from-emerald-800 to-green-900 p-2 rounded-xl shadow-2xl">
        <div className="grid grid-cols-8 gap-0.5">
          {board.map((cell, i) => {
            const isValid = validMoves.includes(i);
            return (
              <button
                key={i}
                onClick={() => makeMove(i)}
                disabled={moving || !isValid || game.status !== 'playing'}
                className={`w-9 h-9 sm:w-11 sm:h-11 rounded-sm flex items-center justify-center transition-all
                  ${isValid ? 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer' : 'bg-emerald-700'}
                  ${isValid ? 'ring-2 ring-yellow-400/50' : ''}
                `}
              >
                {cell === 'B' && (
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gray-900 shadow-lg border-2 border-gray-700" />
                )}
                {cell === 'W' && (
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white shadow-lg border-2 border-gray-200" />
                )}
                {cell === '' && isValid && (
                  <div className="w-3 h-3 rounded-full bg-yellow-400/40" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {validMoves.length === 0 && game.status === 'playing' && isMyTurn && (
        <div className="text-amber-400 text-sm">No valid moves - passing turn...</div>
      )}

      {/* Players */}
      <div className="flex gap-4 w-full text-sm">
        <div className={`flex-1 p-3 rounded-lg border ${game.turn === game.playerX && game.status === 'playing' ? 'border-gray-400 bg-gray-900/50' : 'border-gray-700 bg-gray-800'}`}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-900 border border-gray-600" />
            <span className="text-gray-400">Black</span>
          </div>
          <div className="truncate font-mono text-xs mt-1">{game.playerX === userId ? 'You' : (isSinglePlayer ? 'Player' : 'Opponent')}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${game.turn === game.playerO && game.status === 'playing' ? 'border-white bg-white/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-white border border-gray-300" />
            <span className="text-gray-400">White</span>
          </div>
          <div className="truncate font-mono text-xs mt-1">{game.playerO === userId ? 'You' : (isSinglePlayer ? 'AI' : (game.playerO ? 'Opponent' : 'Waiting...'))}</div>
        </div>
      </div>

      <GameChat gameId={gameId} userId={userId} opponentId={game.playerO && game.playerO !== `${userId}-O` ? game.playerO : null} isSinglePlayer={isSinglePlayer} />
    </div>
  );
};

export default ReversiBoard;
