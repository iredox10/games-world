import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Share2, Circle, Flag } from 'lucide-react';
import GameChat from './GameChat';
import GameControls from './GameControls';
import GameShare from './GameShare';
import { updatePlayerStats } from '../utils/playerStats';
import { useSounds } from '../hooks/useSounds';

interface GoBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const BOARD_SIZE = 9;
const KOMI = 6.5; // Compensation for white going second

interface GoState {
  board: string; // comma-separated 81 cells or sparse format
  captures: [number, number]; // [black captures, white captures]
  passes: number; // consecutive passes
  lastMove: number | null; // for ko detection
  prevBoard: string | null; // previous board state for ko
}

// Parse board data - handles both compact and full formats
const parseBoardData = (boardStr: string): GoState => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'go' && parsed.d) {
      const d = parsed.d;
      // Handle compact format: {b:'',c:[0,0],p:0}
      if ('b' in d) {
        // b is in sparse format, convert to comma-separated
        const boardArr = sparseToArray(d.b || '');
        return {
          board: boardArr.join(','),
          captures: d.c || [0, 0],
          passes: d.p || 0,
          lastMove: d.l ?? null,
          prevBoard: d.pb ?? null,
        };
      }
      // Handle full format (legacy)
      return {
        board: d.board || Array(81).fill('').join(','),
        captures: d.captures || [0, 0],
        passes: d.passes || 0,
        lastMove: d.lastMove ?? null,
        prevBoard: d.prevBoard ?? null,
      };
    }
    return createInitialState();
  } catch {
    return createInitialState();
  }
};

// Convert sparse format to board array
// Sparse format: "0B5W10B" means position 0 has B, position 5 has W, position 10 has B
const sparseToArray = (sparse: string): string[] => {
  const arr = Array(81).fill('');
  if (!sparse) return arr;
  
  // Check if it's hex bitmap format (41 chars of hex)
  if (/^[0-9a-f]+$/i.test(sparse) && sparse.length >= 20) {
    return hexToArray(sparse);
  }
  
  // Match patterns like "0B" or "45W"
  const matches = sparse.match(/(\d+)([BW])/g);
  if (matches) {
    matches.forEach(match => {
      const pos = parseInt(match.slice(0, -1));
      const color = match.slice(-1);
      if (pos >= 0 && pos < 81) arr[pos] = color;
    });
  }
  return arr;
};

// Convert board array to hex bitmap (fixed 41 chars)
// Each cell uses 2 bits: 00=empty, 01=B, 10=W
const arrayToHex = (arr: string[]): string => {
  let bits = '';
  for (let i = 0; i < 81; i++) {
    const c = arr[i] || '';
    bits += c === 'B' ? '01' : c === 'W' ? '10' : '00';
  }
  // Pad to multiple of 4 bits (162 bits -> 164 bits)
  bits = bits.padEnd(164, '0');
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16);
  }
  return hex;
};

// Convert hex bitmap to board array
const hexToArray = (hex: string): string[] => {
  const arr = Array(81).fill('');
  let bits = '';
  for (const c of hex) {
    bits += parseInt(c, 16).toString(2).padStart(4, '0');
  }
  for (let i = 0; i < 81; i++) {
    const val = bits.substr(i * 2, 2);
    if (val === '01') arr[i] = 'B';
    else if (val === '10') arr[i] = 'W';
  }
  return arr;
};

// Serialize board data - use hex bitmap format (fixed size, always under 100 chars)
const serializeBoardData = (state: GoState): string => {
  const boardArr = boardToArray(state.board);
  const hex = arrayToHex(boardArr);
  
  const compact: any = {
    b: hex,
    c: state.captures,
    p: state.passes,
  };
  if (state.lastMove !== null) compact.l = state.lastMove;
  return JSON.stringify({ t: 'go', d: compact });
};

// Create initial empty state
const createInitialState = (): GoState => {
  return {
    board: Array(81).fill('').join(','),
    captures: [0, 0],
    passes: 0,
    lastMove: null,
    prevBoard: null,
  };
};

// Get board as array
const boardToArray = (board: string): string[] => {
  // Check if it's sparse format or comma-separated
  if (board.includes(',')) {
    return board.split(',');
  }
  // Sparse format
  return sparseToArray(board);
};

const arrayToBoard = (arr: string[]): string => arr.join(',');

// Get adjacent positions
const getAdjacent = (pos: number): number[] => {
  const row = Math.floor(pos / BOARD_SIZE);
  const col = pos % BOARD_SIZE;
  const adjacent: number[] = [];
  
  if (row > 0) adjacent.push(pos - BOARD_SIZE);
  if (row < BOARD_SIZE - 1) adjacent.push(pos + BOARD_SIZE);
  if (col > 0) adjacent.push(pos - 1);
  if (col < BOARD_SIZE - 1) adjacent.push(pos + 1);
  
  return adjacent;
};

// Find connected group and its liberties
const findGroup = (boardArr: string[], pos: number): { group: Set<number>; liberties: Set<number> } => {
  const color = boardArr[pos];
  if (color === '') return { group: new Set(), liberties: new Set() };
  
  const group = new Set<number>();
  const liberties = new Set<number>();
  const toCheck = [pos];
  
  while (toCheck.length > 0) {
    const current = toCheck.pop()!;
    if (group.has(current)) continue;
    
    if (boardArr[current] === color) {
      group.add(current);
      for (const adj of getAdjacent(current)) {
        if (boardArr[adj] === '') {
          liberties.add(adj);
        } else if (boardArr[adj] === color && !group.has(adj)) {
          toCheck.push(adj);
        }
      }
    }
  }
  
  return { group, liberties };
};

// Remove captured stones
const removeCaptures = (boardArr: string[], color: string): { newBoard: string[]; captured: number } => {
  const newBoard = [...boardArr];
  let captured = 0;
  const checked = new Set<number>();
  
  for (let i = 0; i < 81; i++) {
    if (newBoard[i] === color && !checked.has(i)) {
      const { group, liberties } = findGroup(newBoard, i);
      group.forEach(p => checked.add(p));
      
      if (liberties.size === 0) {
        group.forEach(p => {
          newBoard[p] = '';
          captured++;
        });
      }
    }
  }
  
  return { newBoard, captured };
};

// Check if move is valid
const isValidMove = (state: GoState, pos: number, color: string): boolean => {
  const boardArr = boardToArray(state.board);
  
  // Position must be empty
  if (boardArr[pos] !== '') return false;
  
  // Try the move
  const testBoard = [...boardArr];
  testBoard[pos] = color;
  
  // Check captures first
  const opponent = color === 'B' ? 'W' : 'B';
  const { newBoard: afterCapture } = removeCaptures(testBoard, opponent);
  
  // Check if our stone has liberties after captures
  const { liberties } = findGroup(afterCapture, pos);
  if (liberties.size === 0) {
    // Check if we captured anything (then it's valid)
    const { captured } = removeCaptures([...boardArr, ...testBoard.slice(boardArr.length)], opponent);
    if (captured === 0) return false; // Suicide
  }
  
  // Ko rule: can't recreate previous board state
  if (state.prevBoard && arrayToBoard(afterCapture) === state.prevBoard) {
    return false;
  }
  
  return true;
};

// Calculate territory (simplified)
const calculateScore = (boardArr: string[], captures: [number, number]): { black: number; white: number } => {
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let blackStones = 0;
  let whiteStones = 0;
  
  const checked = new Set<number>();
  
  for (let i = 0; i < 81; i++) {
    if (boardArr[i] === 'B') blackStones++;
    else if (boardArr[i] === 'W') whiteStones++;
    else if (!checked.has(i)) {
      // Empty - find connected empty region and determine owner
      const region = new Set<number>();
      const toCheck = [i];
      let touchesBlack = false;
      let touchesWhite = false;
      
      while (toCheck.length > 0) {
        const current = toCheck.pop()!;
        if (region.has(current)) continue;
        
        if (boardArr[current] === '') {
          region.add(current);
          for (const adj of getAdjacent(current)) {
            if (boardArr[adj] === '') {
              if (!region.has(adj)) toCheck.push(adj);
            } else if (boardArr[adj] === 'B') {
              touchesBlack = true;
            } else {
              touchesWhite = true;
            }
          }
        }
      }
      
      region.forEach(p => checked.add(p));
      
      if (touchesBlack && !touchesWhite) {
        blackTerritory += region.size;
      } else if (touchesWhite && !touchesBlack) {
        whiteTerritory += region.size;
      }
    }
  }
  
  return {
    black: blackStones + blackTerritory + captures[0],
    white: whiteStones + whiteTerritory + captures[1] + KOMI,
  };
};

const GoBoard: React.FC<GoBoardProps> = ({ gameId, userId, onQuit }) => {
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

  const makeMove = async (pos: number) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
    if (!isMyTurn) return;

    const state = parseBoardData(game.board);
    const currentColor = game.turn === game.playerX ? 'B' : 'W';

    if (!isValidMove(state, pos, currentColor)) return;

    play('move');
    setMoving(true);

    try {
      const boardArr = boardToArray(state.board);
      boardArr[pos] = currentColor;
      
      // Remove opponent captures
      const opponent = currentColor === 'B' ? 'W' : 'B';
      const { newBoard, captured } = removeCaptures(boardArr, opponent);
      
      const newCaptures: [number, number] = [...state.captures];
      if (currentColor === 'B') newCaptures[0] += captured;
      else newCaptures[1] += captured;

      const newState: GoState = {
        board: arrayToBoard(newBoard),
        captures: newCaptures,
        passes: 0,
        lastMove: pos,
        prevBoard: state.board,
      };

      await databases.updateDocument('main', 'games', gameId, {
        board: serializeBoardData(newState),
        turn: game.turn === game.playerX ? game.playerO : game.playerX,
      });

      // AI move
      if (isSinglePlayer) {
        setTimeout(async () => {
          const aiState = parseBoardData(serializeBoardData(newState));
          const aiColor = 'W';
          
          // Find valid moves
          const validMoves: number[] = [];
          for (let i = 0; i < 81; i++) {
            if (isValidMove(aiState, i, aiColor)) {
              validMoves.push(i);
            }
          }

          if (validMoves.length === 0) {
            // AI passes
            await handlePass(true, newState);
            return;
          }

          // AI Strategy: prefer center, captures, and territory
          let bestMove = validMoves[Math.floor(Math.random() * validMoves.length)];
          let bestScore = -1000;

          for (const move of validMoves) {
            const testBoard = boardToArray(aiState.board);
            testBoard[move] = aiColor;
            const { newBoard: afterCapture, captured: testCaptures } = removeCaptures(testBoard, 'B');
            
            let score = testCaptures * 10; // Captures are valuable
            
            // Prefer center area
            const row = Math.floor(move / BOARD_SIZE);
            const col = move % BOARD_SIZE;
            const centerDist = Math.abs(row - 4) + Math.abs(col - 4);
            score += (8 - centerDist);
            
            // Check liberties of placed stone
            const { liberties } = findGroup(afterCapture, move);
            score += liberties.size * 2;
            
            if (score > bestScore) {
              bestScore = score;
              bestMove = move;
            }
          }

          const aiBoardArr = boardToArray(aiState.board);
          aiBoardArr[bestMove] = aiColor;
          const { newBoard: aiNewBoard, captured: aiCaptured } = removeCaptures(aiBoardArr, 'B');
          
          const aiNewCaptures: [number, number] = [...newState.captures];
          aiNewCaptures[1] += aiCaptured;

          const finalAiState: GoState = {
            board: arrayToBoard(aiNewBoard),
            captures: aiNewCaptures,
            passes: 0,
            lastMove: bestMove,
            prevBoard: aiState.board,
          };

          await databases.updateDocument('main', 'games', gameId, {
            board: serializeBoardData(finalAiState),
            turn: game.playerX,
          });
        }, 800);
      }
    } catch (err) {
      console.error("Move failed", err);
    } finally {
      setMoving(false);
    }
  };

  const handlePass = async (isAi: boolean = false, currentState?: GoState) => {
    if (moving || game.status !== 'playing' || isPaused) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (!isAi) {
      const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
      if (!isMyTurn) return;
    }

    setMoving(true);

    try {
      const state = currentState || parseBoardData(game.board);
      const newPasses = state.passes + 1;

      if (newPasses >= 2) {
        // Game over - both passed
        const boardArr = boardToArray(state.board);
        const scores = calculateScore(boardArr, state.captures);
        
        let winner = null;
        if (scores.black > scores.white) winner = game.playerX;
        else if (scores.white > scores.black) winner = game.playerO;
        else winner = 'draw';

        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData({ ...state, passes: newPasses }),
          winner,
          status: 'finished',
        });
      } else {
        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData({ ...state, passes: newPasses, lastMove: null }),
          turn: game.turn === game.playerX ? game.playerO : game.playerX,
        });

        // AI response to pass
        if (!isAi && isSinglePlayer) {
          setTimeout(async () => {
            // AI decides whether to pass or play
            const aiState = parseBoardData(game.board);
            const validMoves: number[] = [];
            for (let i = 0; i < 81; i++) {
              if (isValidMove(aiState, i, 'W')) validMoves.push(i);
            }
            
            // If few valid moves or board is mostly filled, pass
            const boardArr = boardToArray(aiState.board);
            const filledCount = boardArr.filter(c => c !== '').length;
            
            if (validMoves.length < 3 || filledCount > 60) {
              await handlePass(true, { ...state, passes: newPasses });
            } else {
              // Make a move instead
              const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
              const aiBoardArr = boardToArray(state.board);
              aiBoardArr[randomMove] = 'W';
              const { newBoard, captured } = removeCaptures(aiBoardArr, 'B');
              
              const newCaptures: [number, number] = [...state.captures];
              newCaptures[1] += captured;

              await databases.updateDocument('main', 'games', gameId, {
                board: serializeBoardData({
                  board: arrayToBoard(newBoard),
                  captures: newCaptures,
                  passes: 0,
                  lastMove: randomMove,
                  prevBoard: state.board,
                }),
                turn: game.playerX,
              });
            }
          }, 800);
        }
      }
    } catch (err) {
      console.error("Pass failed", err);
    } finally {
      setMoving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>;
  if (!game) return <div>Game not found.</div>;

  const state = parseBoardData(game.board);
  const boardArr = boardToArray(state.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isMyTurn = isSinglePlayer ? game.turn === game.playerX : game.turn === userId;
  const myColor = game.playerX === userId ? 'B' : 'W';
  
  const scores = calculateScore(boardArr, state.captures);

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
      {/* Header */}
      <div className="w-full glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stone-600 to-stone-800 flex items-center justify-center">
            <Circle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Go (9x9)</h3>
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

      <GameShare gameId={gameId} gameName="Go" isOpen={showShare} onClose={() => setShowShare(false)} />
      <GameControls gameId={gameId} userId={userId} game={game} isSinglePlayer={isSinglePlayer} onRestart={handleRestart} />

      {/* Score */}
      <div className="flex justify-center gap-6 glass rounded-xl p-4 text-sm">
        <div className="text-center">
          <div className="w-6 h-6 rounded-full bg-gray-900 border-2 border-gray-600 mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{scores.black.toFixed(1)}</div>
          <div className="text-xs text-gray-500">Black {myColor === 'B' ? '(You)' : ''}</div>
          <div className="text-xs text-gray-600">Cap: {state.captures[0]}</div>
        </div>
        <div className="text-gray-600 text-xl font-bold self-center">vs</div>
        <div className="text-center">
          <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-300 mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{scores.white.toFixed(1)}</div>
          <div className="text-xs text-gray-500">White {myColor === 'W' ? '(You)' : ''}</div>
          <div className="text-xs text-gray-600">Cap: {state.captures[1]}</div>
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
      <div className="bg-amber-200 p-2 rounded-lg shadow-2xl">
        <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}>
          {boardArr.map((cell, i) => {
            const row = Math.floor(i / BOARD_SIZE);
            const col = i % BOARD_SIZE;
            const isStarPoint = [2, 4, 6].includes(row) && [2, 4, 6].includes(col);
            const isLastMove = state.lastMove === i;
            
            return (
              <button
                key={i}
                onClick={() => makeMove(i)}
                disabled={moving || cell !== '' || game.status !== 'playing' || !isMyTurn}
                className="w-8 h-8 sm:w-9 sm:h-9 relative flex items-center justify-center"
              >
                {/* Grid lines */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`absolute bg-stone-800 ${col < BOARD_SIZE - 1 ? 'w-full' : 'w-1/2'} h-px ${col > 0 ? '' : 'left-1/2'}`} style={{ left: col > 0 ? 0 : '50%' }} />
                  <div className={`absolute bg-stone-800 w-px ${row < BOARD_SIZE - 1 ? 'h-full' : 'h-1/2'} ${row > 0 ? '' : 'top-1/2'}`} style={{ top: row > 0 ? 0 : '50%' }} />
                </div>
                
                {/* Star points */}
                {isStarPoint && cell === '' && (
                  <div className="absolute w-2 h-2 rounded-full bg-stone-800" />
                )}
                
                {/* Stones */}
                {cell === 'B' && (
                  <div className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg z-10 ${isLastMove ? 'ring-2 ring-red-500' : ''}`}>
                    {isLastMove && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-red-500" /></div>}
                  </div>
                )}
                {cell === 'W' && (
                  <div className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-gray-100 to-white shadow-lg z-10 border border-gray-300 ${isLastMove ? 'ring-2 ring-red-500' : ''}`}>
                    {isLastMove && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-red-500" /></div>}
                  </div>
                )}
                
                {/* Hover indicator */}
                {cell === '' && isMyTurn && game.status === 'playing' && (
                  <div className="absolute w-6 h-6 rounded-full opacity-0 hover:opacity-30 bg-current z-20" 
                    style={{ color: myColor === 'B' ? 'black' : 'white' }} 
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pass button */}
      {game.status === 'playing' && isMyTurn && (
        <button
          onClick={() => handlePass()}
          disabled={moving}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white transition-all disabled:opacity-50"
        >
          <Flag size={18} />
          <span>Pass</span>
        </button>
      )}

      {state.passes > 0 && game.status === 'playing' && (
        <div className="text-amber-400 text-sm">Opponent passed. Pass again to end game.</div>
      )}

      <div className="text-xs text-gray-500 text-center">
        Place stones to surround territory. Capture groups with no liberties. Both pass to end.
      </div>

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
            <span className="text-gray-400">White (+{KOMI})</span>
          </div>
          <div className="truncate font-mono text-xs mt-1">{game.playerO === userId ? 'You' : (isSinglePlayer ? 'AI' : (game.playerO ? 'Opponent' : 'Waiting...'))}</div>
        </div>
      </div>

      <GameChat gameId={gameId} userId={userId} opponentId={game.playerO && game.playerO !== `${userId}-O` ? game.playerO : null} isSinglePlayer={isSinglePlayer} />
    </div>
  );
};

export default GoBoard;
