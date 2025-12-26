import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home } from 'lucide-react';
import GameChat from './GameChat';

interface ConnectFourBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const ROWS = 6;
const COLS = 7;

// Helper to parse board data (handles compact format)
const parseBoardData = (boardStr: string): string[][] => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format: {t:'c4', d:',,,,,...'} - 42 cells as comma-separated string
    if (parsed.t === 'c4' && typeof parsed.d === 'string') {
      const cells = parsed.d.split(',');
      const board: string[][] = [];
      for (let r = 0; r < ROWS; r++) {
        board.push(cells.slice(r * COLS, (r + 1) * COLS));
      }
      return board;
    }
    // Old format with type/data
    if (parsed.type && parsed.data) {
      return parsed.data;
    }
    // Plain 2D array format
    if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
      return parsed;
    }
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(""));
  } catch {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(""));
  }
};

// Helper to serialize board data
const serializeBoardData = (boardStr: string, newData: string[][]): string => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format - flatten to comma-separated string
    if (parsed.t === 'c4') {
      const flat = newData.flat().join(',');
      return JSON.stringify({ t: 'c4', d: flat });
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

const ConnectFourBoard: React.FC<ConnectFourBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

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

  const checkWinner = (board: string[][]): string | null => {
    // Check horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        if (board[r][c] && board[r][c] === board[r][c+1] && board[r][c] === board[r][c+2] && board[r][c] === board[r][c+3]) {
          return board[r][c];
        }
      }
    }
    // Check vertical
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] && board[r][c] === board[r+1][c] && board[r][c] === board[r+2][c] && board[r][c] === board[r+3][c]) {
          return board[r][c];
        }
      }
    }
    // Check diagonal (down-right)
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        if (board[r][c] && board[r][c] === board[r+1][c+1] && board[r][c] === board[r+2][c+2] && board[r][c] === board[r+3][c+3]) {
          return board[r][c];
        }
      }
    }
    // Check diagonal (down-left)
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 3; c < COLS; c++) {
        if (board[r][c] && board[r][c] === board[r+1][c-1] && board[r][c] === board[r+2][c-2] && board[r][c] === board[r+3][c-3]) {
          return board[r][c];
        }
      }
    }
    return null;
  };

  const isBoardFull = (board: string[][]): boolean => {
    return board[0].every(cell => cell !== '');
  };

  const makeMove = async (col: number) => {
    if (moving || game.status !== 'playing') return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    if (!isSinglePlayer && game.turn !== userId) return;

    const board: string[][] = parseBoardData(game.board);
    
    // Find the lowest empty row in this column
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === '') {
        row = r;
        break;
      }
    }
    
    if (row === -1) return; // Column is full

    setMoving(true);
    try {
      const currentPlayer = game.turn === game.playerX ? 'R' : 'Y'; // Red or Yellow
      board[row][col] = currentPlayer;

      const winnerSymbol = checkWinner(board);
      let winner = null;
      let status = 'playing';

      if (winnerSymbol) {
        winner = winnerSymbol === 'R' ? game.playerX : game.playerO;
        status = 'finished';
      } else if (isBoardFull(board)) {
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
    } catch (err) {
      console.error("Move failed", err);
    } finally {
      setMoving(false);
    }
  };

  if (loading) return <div>Loading Game...</div>;
  if (!game) return <div>Game not found.</div>;

  const board: string[][] = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isMyTurn = isSinglePlayer || game.turn === userId;
  const currentSymbol = game.turn === game.playerX ? 'Red' : 'Yellow';

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
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
        {game.status === 'waiting' ? (
          <div className="animate-pulse text-yellow-500 font-semibold">
            Waiting for opponent...
          </div>
        ) : game.status === 'finished' ? (
          <div className="text-2xl font-bold text-green-500">
            {game.winner === 'draw' ? "It's a Draw!" : game.winner === userId ? "You Won! 🎉" : "Opponent Won!"}
          </div>
        ) : (
          <div className={`text-xl font-semibold ${isMyTurn ? 'text-blue-400' : 'text-gray-400'}`}>
            {isSinglePlayer ? `${currentSymbol}'s Turn` : (isMyTurn ? "Your Turn" : "Opponent's Turn")}
          </div>
        )}
      </div>

      <div className="bg-blue-900 p-2 rounded-xl shadow-2xl">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: COLS }).map((_, col) => (
            <button
              key={`header-${col}`}
              className="w-10 h-6 sm:w-12 sm:h-8 flex items-center justify-center hover:bg-blue-800 rounded transition-colors"
              onMouseEnter={() => setHoverCol(col)}
              onMouseLeave={() => setHoverCol(null)}
              onClick={() => makeMove(col)}
              disabled={moving || game.status !== 'playing' || !isMyTurn || board[0][col] !== ''}
            >
              {hoverCol === col && isMyTurn && game.status === 'playing' && board[0][col] === '' && (
                <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full opacity-50 ${game.turn === game.playerX ? 'bg-red-500' : 'bg-yellow-400'}`} />
              )}
            </button>
          ))}
        </div>
        {board.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-1">
            {row.map((cell, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                onClick={() => makeMove(colIndex)}
                disabled={moving || cell !== '' || game.status !== 'playing' || !isMyTurn || board[0][colIndex] !== ''}
                className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-blue-800 rounded-full"
              >
                {cell === 'R' && <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-500 shadow-inner" />}
                {cell === 'Y' && <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-yellow-400 shadow-inner" />}
                {cell === '' && <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-900" />}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-4 w-full text-sm">
        <div className={`flex-1 p-3 rounded-lg border ${game.playerX === userId ? 'border-red-500 bg-red-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-gray-400">Red</span>
          </div>
          <div className="truncate font-mono text-xs mt-1">{game.playerX}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${game.playerO === userId ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-400" />
            <span className="text-gray-400">Yellow</span>
          </div>
          <div className="truncate font-mono text-xs mt-1">{game.playerO || 'Waiting...'}</div>
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

export default ConnectFourBoard;
