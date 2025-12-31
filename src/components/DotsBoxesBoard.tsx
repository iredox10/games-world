import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Share2, Grid3X3 } from 'lucide-react';
import GameChat from './GameChat';
import GameControls from './GameControls';
import GameShare from './GameShare';
import { updatePlayerStats } from '../utils/playerStats';
import { useSounds } from '../hooks/useSounds';

interface DotsBoxesBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const GRID_SIZE = 4; // 4x4 boxes = 5x5 dots
const DOTS = GRID_SIZE + 1;

interface DotsState {
  h: string; // horizontal lines: DOTS * GRID_SIZE bits
  v: string; // vertical lines: GRID_SIZE * DOTS bits
  boxes: string; // box owners: GRID_SIZE * GRID_SIZE ('', '1', '2')
  scores: [number, number];
}

// Convert binary string to hex
const binToHex = (bin: string): string => {
  if (!bin || bin === '0'.repeat(bin.length)) return '0';
  return parseInt(bin, 2).toString(16);
};

// Convert hex to binary string (padded to expected length)
const hexToBin = (hex: string, len: number): string => {
  if (!hex || hex === '0') return '0'.repeat(len);
  return parseInt(hex, 16).toString(2).padStart(len, '0');
};

// Parse board data - handles both compact hex and full formats
const parseBoardData = (boardStr: string): DotsState => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'dots' && parsed.d) {
      const d = parsed.d;
      const hLen = DOTS * GRID_SIZE; // 20
      const vLen = GRID_SIZE * DOTS; // 20
      
      // Detect if using hex format (short string) or binary format (long string)
      let h = d.h || '';
      let v = d.v || '';
      
      // If h/v are short, they're hex encoded
      if (h.length < hLen) {
        h = hexToBin(h, hLen);
      }
      if (v.length < vLen) {
        v = hexToBin(v, vLen);
      }
      
      // Ensure correct length
      h = h.padEnd(hLen, '0').slice(0, hLen);
      v = v.padEnd(vLen, '0').slice(0, vLen);
      
      return {
        h,
        v,
        boxes: (d.boxes || d.bx || '').padEnd(GRID_SIZE * GRID_SIZE, '0').slice(0, GRID_SIZE * GRID_SIZE),
        scores: d.scores || d.s || [0, 0],
      };
    }
    return createInitialState();
  } catch {
    return createInitialState();
  }
};

// Serialize board data - use compact hex format to stay under 100 chars
const serializeBoardData = (state: DotsState): string => {
  return JSON.stringify({ 
    t: 'dots', 
    d: { 
      h: binToHex(state.h), 
      v: binToHex(state.v), 
      bx: state.boxes, 
      s: state.scores 
    } 
  });
};

// Create initial empty state
const createInitialState = (): DotsState => {
  return {
    h: '0'.repeat(DOTS * GRID_SIZE), // 5 rows of 4 horizontal lines
    v: '0'.repeat(GRID_SIZE * DOTS), // 4 rows of 5 vertical lines
    boxes: '0'.repeat(GRID_SIZE * GRID_SIZE),
    scores: [0, 0],
  };
};

// Check if a box is completed after drawing a line
const checkBoxes = (state: DotsState, player: '1' | '2'): { newState: DotsState; completed: number } => {
  const newBoxes = state.boxes.split('');
  let completed = 0;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const boxIdx = row * GRID_SIZE + col;
      if (newBoxes[boxIdx] !== '0') continue; // Already claimed

      // Check all 4 sides of this box
      const topH = state.h[row * GRID_SIZE + col];
      const bottomH = state.h[(row + 1) * GRID_SIZE + col];
      const leftV = state.v[row * DOTS + col];
      const rightV = state.v[row * DOTS + col + 1];

      if (topH === '1' && bottomH === '1' && leftV === '1' && rightV === '1') {
        newBoxes[boxIdx] = player;
        completed++;
      }
    }
  }

  const newScores: [number, number] = [...state.scores];
  newScores[parseInt(player) - 1] += completed;

  return {
    newState: { ...state, boxes: newBoxes.join(''), scores: newScores },
    completed,
  };
};

// Get all available moves
const getAvailableMoves = (state: DotsState): { type: 'h' | 'v'; index: number }[] => {
  const moves: { type: 'h' | 'v'; index: number }[] = [];
  
  for (let i = 0; i < state.h.length; i++) {
    if (state.h[i] === '0') moves.push({ type: 'h', index: i });
  }
  for (let i = 0; i < state.v.length; i++) {
    if (state.v[i] === '0') moves.push({ type: 'v', index: i });
  }
  
  return moves;
};

// Count sides of a box
const countBoxSides = (state: DotsState, row: number, col: number): number => {
  let count = 0;
  const topH = state.h[row * GRID_SIZE + col];
  const bottomH = state.h[(row + 1) * GRID_SIZE + col];
  const leftV = state.v[row * DOTS + col];
  const rightV = state.v[row * DOTS + col + 1];
  
  if (topH === '1') count++;
  if (bottomH === '1') count++;
  if (leftV === '1') count++;
  if (rightV === '1') count++;
  
  return count;
};

// Apply a move and return new state
const applyMove = (state: DotsState, type: 'h' | 'v', index: number): DotsState => {
  if (type === 'h') {
    const newH = state.h.split('');
    newH[index] = '1';
    return { ...state, h: newH.join('') };
  } else {
    const newV = state.v.split('');
    newV[index] = '1';
    return { ...state, v: newV.join('') };
  }
};

const DotsBoxesBoard: React.FC<DotsBoxesBoardProps> = ({ gameId, userId, onQuit }) => {
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

  const makeMove = async (type: 'h' | 'v', index: number) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
    if (!isMyTurn) return;

    const state = parseBoardData(game.board);
    
    // Check if line already drawn
    if (type === 'h' && state.h[index] === '1') return;
    if (type === 'v' && state.v[index] === '1') return;

    play('move');
    setMoving(true);

    try {
      const player: '1' | '2' = game.turn === game.playerX ? '1' : '2';
      let newState = applyMove(state, type, index);
      const { newState: afterCheck, completed } = checkBoxes(newState, player);
      newState = afterCheck;

      const totalBoxes = GRID_SIZE * GRID_SIZE;
      const claimedBoxes = newState.boxes.split('').filter(b => b !== '0').length;
      
      let winner = null;
      let status = 'playing';
      let nextTurn = completed > 0 ? game.turn : (game.turn === game.playerX ? game.playerO : game.playerX);

      if (claimedBoxes === totalBoxes) {
        status = 'finished';
        if (newState.scores[0] > newState.scores[1]) winner = game.playerX;
        else if (newState.scores[1] > newState.scores[0]) winner = game.playerO;
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
            const moves = getAvailableMoves(aiState);
            if (moves.length === 0) break;

            // AI Strategy: 
            // 1. Complete boxes (3 sides)
            // 2. Avoid giving boxes (don't make 3rd side)
            // 3. Random safe move
            let bestMove = moves[0];
            let bestScore = -100;

            for (const move of moves) {
              let score = 0;
              const testState = applyMove(aiState, move.type, move.index);
              const { completed: testCompleted } = checkBoxes(testState, '2');
              
              if (testCompleted > 0) {
                score = 100 + testCompleted * 10; // Prioritize completing boxes
              } else {
                // Check if this gives opponent a box
                let givesBox = false;
                for (let row = 0; row < GRID_SIZE; row++) {
                  for (let col = 0; col < GRID_SIZE; col++) {
                    if (testState.boxes[row * GRID_SIZE + col] === '0') {
                      if (countBoxSides(testState, row, col) === 3) {
                        givesBox = true;
                        break;
                      }
                    }
                  }
                  if (givesBox) break;
                }
                score = givesBox ? -50 : 0;
              }

              if (score > bestScore) {
                bestScore = score;
                bestMove = move;
              }
            }

            aiState = applyMove(aiState, bestMove.type, bestMove.index);
            const { newState: afterAiCheck, completed: aiCompleted } = checkBoxes(aiState, '2');
            aiState = afterAiCheck;

            aiTurn = aiCompleted > 0; // AI gets another turn if completed a box

            const aiClaimedBoxes = aiState.boxes.split('').filter(b => b !== '0').length;
            if (aiClaimedBoxes === totalBoxes) {
              let aiWinner = null;
              if (aiState.scores[0] > aiState.scores[1]) aiWinner = game.playerX;
              else if (aiState.scores[1] > aiState.scores[0]) aiWinner = game.playerO;
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
        }, 600);
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
  const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
  const isPlayer1 = game.playerX === userId;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Grid3X3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Dots & Boxes</h3>
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

      <GameShare gameId={gameId} gameName="Dots & Boxes" isOpen={showShare} onClose={() => setShowShare(false)} />
      <GameControls gameId={gameId} userId={userId} game={game} isSinglePlayer={isSinglePlayer} onRestart={handleRestart} />

      {/* Score */}
      <div className="flex justify-center gap-8 glass rounded-xl p-4">
        <div className="text-center">
          <div className="w-6 h-6 rounded bg-blue-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-blue-400">{state.scores[0]}</div>
          <div className="text-xs text-gray-500">{isPlayer1 ? 'You' : (isSinglePlayer ? 'Player' : 'Opponent')}</div>
        </div>
        <div className="text-gray-600 text-2xl font-bold self-center">vs</div>
        <div className="text-center">
          <div className="w-6 h-6 rounded bg-red-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-red-400">{state.scores[1]}</div>
          <div className="text-xs text-gray-500">{!isPlayer1 ? 'You' : (isSinglePlayer ? 'AI' : 'Opponent')}</div>
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
              {isMyTurn ? "Your Turn - Draw a line!" : (isSinglePlayer ? "AI Thinking..." : "Opponent's Turn")}
            </span>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="glass rounded-xl p-4">
        <div className="relative" style={{ width: DOTS * 40 + (DOTS - 1) * 20, height: DOTS * 40 + (DOTS - 1) * 20 }}>
          {/* Dots */}
          {Array.from({ length: DOTS * DOTS }).map((_, i) => {
            const row = Math.floor(i / DOTS);
            const col = i % DOTS;
            return (
              <div
                key={`dot-${i}`}
                className="absolute w-3 h-3 rounded-full bg-white shadow-lg"
                style={{ left: col * 60 - 6, top: row * 60 - 6 }}
              />
            );
          })}

          {/* Horizontal lines */}
          {Array.from({ length: DOTS * GRID_SIZE }).map((_, i) => {
            const row = Math.floor(i / GRID_SIZE);
            const col = i % GRID_SIZE;
            const isDrawn = state.h[i] === '1';
            const canDraw = !isDrawn && isMyTurn && game.status === 'playing';
            
            return (
              <button
                key={`h-${i}`}
                onClick={() => makeMove('h', i)}
                disabled={!canDraw || moving}
                className={`absolute h-2 rounded-full transition-all ${
                  isDrawn ? 'bg-gray-300' : canDraw ? 'bg-gray-600 hover:bg-pink-400 cursor-pointer' : 'bg-gray-700'
                }`}
                style={{ left: col * 60 + 6, top: row * 60 - 4, width: 48 }}
              />
            );
          })}

          {/* Vertical lines */}
          {Array.from({ length: GRID_SIZE * DOTS }).map((_, i) => {
            const row = Math.floor(i / DOTS);
            const col = i % DOTS;
            const isDrawn = state.v[i] === '1';
            const canDraw = !isDrawn && isMyTurn && game.status === 'playing';
            
            return (
              <button
                key={`v-${i}`}
                onClick={() => makeMove('v', i)}
                disabled={!canDraw || moving}
                className={`absolute w-2 rounded-full transition-all ${
                  isDrawn ? 'bg-gray-300' : canDraw ? 'bg-gray-600 hover:bg-pink-400 cursor-pointer' : 'bg-gray-700'
                }`}
                style={{ left: col * 60 - 4, top: row * 60 + 6, height: 48 }}
              />
            );
          })}

          {/* Boxes */}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
            const row = Math.floor(i / GRID_SIZE);
            const col = i % GRID_SIZE;
            const owner = state.boxes[i];
            
            if (owner === '0') return null;
            
            return (
              <div
                key={`box-${i}`}
                className={`absolute rounded ${owner === '1' ? 'bg-blue-500/50' : 'bg-red-500/50'}`}
                style={{ left: col * 60 + 6, top: row * 60 + 6, width: 48, height: 48 }}
              />
            );
          })}
        </div>
      </div>

      <div className="text-xs text-gray-500">Complete boxes to score. Complete a box = extra turn!</div>

      <div className="flex gap-4 w-full text-sm">
        <div className={`flex-1 p-3 rounded-lg border ${game.turn === game.playerX && game.status === 'playing' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">Player 1</div>
          <div className="truncate font-mono text-xs">{game.playerX === userId ? 'You' : (isSinglePlayer ? 'Player' : 'Opponent')}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${game.turn === game.playerO && game.status === 'playing' ? 'border-red-500 bg-red-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">{isSinglePlayer ? 'AI' : 'Player 2'}</div>
          <div className="truncate font-mono text-xs">{game.playerO === userId ? 'You' : (isSinglePlayer ? 'AI' : (game.playerO || 'Waiting...'))}</div>
        </div>
      </div>

      <GameChat gameId={gameId} userId={userId} opponentId={game.playerO && game.playerO !== `${userId}-O` ? game.playerO : null} isSinglePlayer={isSinglePlayer} />
    </div>
  );
};

export default DotsBoxesBoard;
