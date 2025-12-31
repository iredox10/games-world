import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Share2, Circle } from 'lucide-react';
import GameChat from './GameChat';
import GameControls from './GameControls';
import GameShare from './GameShare';
import { updatePlayerStats } from '../utils/playerStats';
import { useSounds } from '../hooks/useSounds';

interface MancalaBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

interface MancalaState {
  pits: number[]; // 12 pits (0-5: player 1's side, 6-11: player 2's side)
  stores: [number, number]; // [player1 store, player2 store]
}

// Parse board data
const parseBoardData = (boardStr: string): MancalaState => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'mancala' && parsed.d) {
      return parsed.d;
    }
    return createInitialState();
  } catch {
    return createInitialState();
  }
};

// Serialize board data
const serializeBoardData = (state: MancalaState): string => {
  return JSON.stringify({ t: 'mancala', d: state });
};

// Create initial state (4 stones per pit)
const createInitialState = (): MancalaState => {
  return {
    pits: Array(12).fill(4),
    stores: [0, 0],
  };
};

// Check if a side is empty
const isSideEmpty = (pits: number[], player: number): boolean => {
  const start = player === 1 ? 0 : 6;
  const end = player === 1 ? 6 : 12;
  for (let i = start; i < end; i++) {
    if (pits[i] > 0) return false;
  }
  return true;
};

// Perform a move and return result
const makeGameMove = (state: MancalaState, pitIndex: number, player: number): { 
  newState: MancalaState; 
  extraTurn: boolean; 
  gameOver: boolean;
} => {
  const newPits = [...state.pits];
  const newStores: [number, number] = [...state.stores];
  
  let stones = newPits[pitIndex];
  newPits[pitIndex] = 0;
  
  let currentIdx = pitIndex;
  let lastLandedInStore = false;
  
  while (stones > 0) {
    currentIdx++;
    
    // Handle wrapping and stores
    if (currentIdx === 6) {
      // Player 1's store
      if (player === 1) {
        newStores[0]++;
        stones--;
        if (stones === 0) {
          lastLandedInStore = true;
          break;
        }
      }
    }
    
    if (currentIdx === 12) {
      // End of pits, go to player 2's store or wrap
      if (player === 2) {
        newStores[1]++;
        stones--;
        if (stones === 0) {
          lastLandedInStore = true;
          break;
        }
      }
      currentIdx = 0;
      if (currentIdx === pitIndex && stones > 0) {
        // Skip the original pit on first pass
      }
    }
    
    if (currentIdx < 12) {
      newPits[currentIdx]++;
      stones--;
    }
  }
  
  // Capture: if last stone lands in empty pit on player's side
  if (!lastLandedInStore && currentIdx < 12 && newPits[currentIdx] === 1) {
    const playerStart = player === 1 ? 0 : 6;
    const playerEnd = player === 1 ? 6 : 12;
    
    if (currentIdx >= playerStart && currentIdx < playerEnd) {
      // Calculate opposite pit
      const oppositeIdx = 11 - currentIdx;
      if (newPits[oppositeIdx] > 0) {
        const captured = newPits[oppositeIdx] + 1;
        newPits[currentIdx] = 0;
        newPits[oppositeIdx] = 0;
        newStores[player - 1] += captured;
      }
    }
  }
  
  // Check game over
  const side1Empty = isSideEmpty(newPits, 1);
  const side2Empty = isSideEmpty(newPits, 2);
  const gameOver = side1Empty || side2Empty;
  
  // If game over, collect remaining stones
  if (gameOver) {
    for (let i = 0; i < 6; i++) {
      newStores[0] += newPits[i];
      newPits[i] = 0;
    }
    for (let i = 6; i < 12; i++) {
      newStores[1] += newPits[i];
      newPits[i] = 0;
    }
  }
  
  return {
    newState: { pits: newPits, stores: newStores },
    extraTurn: lastLandedInStore,
    gameOver,
  };
};

const MancalaBoard: React.FC<MancalaBoardProps> = ({ gameId, userId, onQuit }) => {
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
      (response) => setGame(response.payload)
    );
    return () => unsubscribe();
  }, [gameId, onQuit]);

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
      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(createInitialState()),
        turn: game.playerX,
        winner: null,
        status: 'playing',
        controls: JSON.stringify({ isPaused: false, pausedBy: null, rematchRequested: null, startTime: Date.now() }),
      });
    } catch (err) {
      console.error("Failed to restart game", err);
    }
  };

  const makeMove = async (pitIndex: number) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const isPlayer1 = game.playerX === userId;
    const currentPlayer = game.turn === game.playerX ? 1 : 2;
    const isMyTurn = isSinglePlayer ? currentPlayer === 1 : (isPlayer1 ? currentPlayer === 1 : currentPlayer === 2);
    
    if (!isMyTurn) return;

    // Validate pit belongs to current player
    const validStart = currentPlayer === 1 ? 0 : 6;
    const validEnd = currentPlayer === 1 ? 6 : 12;
    if (pitIndex < validStart || pitIndex >= validEnd) return;

    const state = parseBoardData(game.board);
    if (state.pits[pitIndex] === 0) return; // Empty pit

    play('move');
    setMoving(true);

    try {
      const { newState, extraTurn, gameOver } = makeGameMove(state, pitIndex, currentPlayer);
      
      let winner = null;
      let status = 'playing';
      let nextTurn = extraTurn ? game.turn : (game.turn === game.playerX ? game.playerO : game.playerX);

      if (gameOver) {
        status = 'finished';
        if (newState.stores[0] > newState.stores[1]) winner = game.playerX;
        else if (newState.stores[1] > newState.stores[0]) winner = game.playerO;
        else winner = 'draw';
      }

      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(newState),
        turn: nextTurn,
        winner,
        status,
      });

      // AI move
      if (isSinglePlayer && status === 'playing' && nextTurn === game.playerO) {
        setTimeout(async () => {
          let aiState = newState;
          let aiTurn = true;

          while (aiTurn) {
            // Find best move for AI (player 2)
            const validMoves: number[] = [];
            for (let i = 6; i < 12; i++) {
              if (aiState.pits[i] > 0) validMoves.push(i);
            }

            if (validMoves.length === 0) break;

            // AI Strategy: prefer moves that land in store, then max captures, then random
            let bestMove = validMoves[0];
            let bestScore = -100;

            for (const move of validMoves) {
              const result = makeGameMove(aiState, move, 2);
              let score = 0;
              
              if (result.extraTurn) score += 50; // Extra turn is valuable
              score += result.newState.stores[1] - aiState.stores[1]; // Stones gained
              
              if (score > bestScore) {
                bestScore = score;
                bestMove = move;
              }
            }

            const result = makeGameMove(aiState, bestMove, 2);
            aiState = result.newState;
            aiTurn = result.extraTurn;

            if (result.gameOver) {
              let aiWinner = null;
              if (aiState.stores[0] > aiState.stores[1]) aiWinner = game.playerX;
              else if (aiState.stores[1] > aiState.stores[0]) aiWinner = game.playerO;
              else aiWinner = 'draw';

              await databases.updateDocument('main', 'games', gameId, {
                board: serializeBoardData(aiState),
                turn: game.playerX,
                winner: aiWinner,
                status: 'finished',
              });
              return;
            }
          }

          await databases.updateDocument('main', 'games', gameId, {
            board: serializeBoardData(aiState),
            turn: game.playerX,
          });
        }, 700);
      }
    } catch (err) {
      console.error("Move failed", err);
    } finally {
      setMoving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>;
  if (!game) return <div>Game not found.</div>;

  const state = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isPlayer1 = game.playerX === userId;
  const currentPlayer = game.turn === game.playerX ? 1 : 2;
  const isMyTurn = isSinglePlayer ? currentPlayer === 1 : (isPlayer1 ? currentPlayer === 1 : currentPlayer === 2);

  // Render pits - Player 2's pits are on top (indices 11-6 right to left)
  // Player 1's pits are on bottom (indices 0-5 left to right)
  const player2Pits = [11, 10, 9, 8, 7, 6];
  const player1Pits = [0, 1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xl">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-700 flex items-center justify-center">
            <Circle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Mancala</h3>
            <p className="text-xs text-gray-500 font-mono">{game.$id.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {game.status === 'waiting' && (
            <button onClick={() => setShowShare(true)} className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center hover:scale-105 transition-all" title="Invite Friend">
              <Share2 size={18} className="text-white" />
            </button>
          )}
          <button onClick={onQuit} className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors group" title="Back to Lobby">
            <Home size={18} className="text-gray-400 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      <GameShare gameId={gameId} gameName="Mancala" isOpen={showShare} onClose={() => setShowShare(false)} />
      <GameControls gameId={gameId} userId={userId} game={game} isSinglePlayer={isSinglePlayer} onRestart={handleRestart} />

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
              {isMyTurn ? "Your Turn - Pick a pit!" : (isSinglePlayer ? "AI Thinking..." : "Opponent's Turn")}
            </span>
          </div>
        )}
      </div>

      {/* Mancala Board */}
      <div className="bg-gradient-to-br from-amber-800 to-amber-900 rounded-3xl p-4 shadow-2xl border-4 border-amber-700">
        <div className="flex items-center gap-2">
          {/* Player 2's Store (left side) */}
          <div className="w-16 h-32 bg-amber-950 rounded-2xl flex flex-col items-center justify-center border-2 border-amber-700">
            <div className="text-2xl font-bold text-amber-300">{state.stores[1]}</div>
            <div className="text-xs text-amber-500">{isSinglePlayer ? 'AI' : (isPlayer1 ? 'Opp' : 'You')}</div>
          </div>

          {/* Pits */}
          <div className="flex-1">
            {/* Player 2's pits (top row, right to left) */}
            <div className="flex gap-2 mb-2">
              {player2Pits.map((pitIdx) => {
                const canClick = currentPlayer === 2 && state.pits[pitIdx] > 0 && isMyTurn && game.status === 'playing';
                return (
                  <button
                    key={`pit-${pitIdx}`}
                    onClick={() => makeMove(pitIdx)}
                    disabled={!canClick || moving}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg font-bold transition-all
                      ${canClick ? 'bg-amber-600 hover:bg-amber-500 cursor-pointer ring-2 ring-amber-400' : 'bg-amber-700'}
                      ${state.pits[pitIdx] === 0 ? 'opacity-50' : ''}
                    `}
                  >
                    <span className="text-amber-100">{state.pits[pitIdx]}</span>
                  </button>
                );
              })}
            </div>

            {/* Player 1's pits (bottom row, left to right) */}
            <div className="flex gap-2">
              {player1Pits.map((pitIdx) => {
                const canClick = currentPlayer === 1 && state.pits[pitIdx] > 0 && isMyTurn && game.status === 'playing';
                return (
                  <button
                    key={`pit-${pitIdx}`}
                    onClick={() => makeMove(pitIdx)}
                    disabled={!canClick || moving}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg font-bold transition-all
                      ${canClick ? 'bg-amber-600 hover:bg-amber-500 cursor-pointer ring-2 ring-amber-400' : 'bg-amber-700'}
                      ${state.pits[pitIdx] === 0 ? 'opacity-50' : ''}
                    `}
                  >
                    <span className="text-amber-100">{state.pits[pitIdx]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Player 1's Store (right side) */}
          <div className="w-16 h-32 bg-amber-950 rounded-2xl flex flex-col items-center justify-center border-2 border-amber-700">
            <div className="text-2xl font-bold text-amber-300">{state.stores[0]}</div>
            <div className="text-xs text-amber-500">{isPlayer1 ? 'You' : (isSinglePlayer ? 'Player' : 'Opp')}</div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 text-center max-w-md">
        Pick stones from a pit and drop them counter-clockwise. Land in your store for an extra turn!
        Land in an empty pit on your side to capture opposite stones.
      </div>

      <div className="flex gap-4 w-full text-sm">
        <div className={`flex-1 p-3 rounded-lg border ${currentPlayer === 1 && game.status === 'playing' ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">Player 1</div>
          <div className="truncate font-mono text-xs">{isPlayer1 ? 'You' : (isSinglePlayer ? 'Player' : 'Opponent')}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${currentPlayer === 2 && game.status === 'playing' ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">{isSinglePlayer ? 'AI' : 'Player 2'}</div>
          <div className="truncate font-mono text-xs">{!isPlayer1 ? 'You' : (isSinglePlayer ? 'AI' : (game.playerO || 'Waiting...'))}</div>
        </div>
      </div>

      <GameChat gameId={gameId} userId={userId} opponentId={game.playerO && game.playerO !== `${userId}-O` ? game.playerO : null} isSinglePlayer={isSinglePlayer} />
    </div>
  );
};

export default MancalaBoard;
