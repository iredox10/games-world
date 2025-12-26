import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Coins } from 'lucide-react';
import GameChat from './GameChat';

interface CoinFlipBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

interface CoinState {
  p1: 'heads' | 'tails' | null; // player 1 guess
  p2: 'heads' | 'tails' | null; // player 2 guess  
  r: 'heads' | 'tails' | null;  // result
  s1: number; // score 1
  s2: number; // score 2
  rd: number; // round
}

// Helper to parse board data
const parseBoardData = (boardStr: string): CoinState => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'coin' && parsed.d) {
      return parsed.d;
    }
    return { p1: null, p2: null, r: null, s1: 0, s2: 0, rd: 0 };
  } catch {
    return { p1: null, p2: null, r: null, s1: 0, s2: 0, rd: 0 };
  }
};

// Helper to serialize board data
const serializeBoardData = (state: CoinState): string => {
  return JSON.stringify({ t: 'coin', d: state });
};

const CoinFlipBoard: React.FC<CoinFlipBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [flipping, setFlipping] = useState(false);

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

  const makeGuess = async (guess: 'heads' | 'tails') => {
    if (choosing || game.status !== 'playing') return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const state = parseBoardData(game.board);
    const isPlayer1 = game.playerX === userId;

    // Check if already guessed
    if (!isSinglePlayer) {
      if (isPlayer1 && state.p1) return;
      if (!isPlayer1 && state.p2) return;
    }

    setChoosing(true);
    try {
      let newState = { ...state };

      if (isSinglePlayer) {
        // Solo: player guesses, AI guesses opposite, flip coin
        const aiGuess = guess === 'heads' ? 'tails' : 'heads';
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        
        newState.p1 = guess;
        newState.p2 = aiGuess;
        newState.r = result;
        newState.rd++;

        if (result === guess) newState.s1++;
        else newState.s2++;

        setFlipping(true);
        
        let winner = null;
        let status = 'playing';
        if (newState.s1 >= 3) {
          winner = game.playerX;
          status = 'finished';
        } else if (newState.s2 >= 3) {
          winner = game.playerO;
          status = 'finished';
        }

        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData(newState),
          winner,
          status,
        });

        // Reset for next round
        setTimeout(async () => {
          setFlipping(false);
          if (status === 'playing') {
            await databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData({ ...newState, p1: null, p2: null, r: null }),
            });
          }
        }, 2000);
      } else {
        // Multiplayer
        if (isPlayer1) newState.p1 = guess;
        else newState.p2 = guess;

        // If both guessed, flip
        if (newState.p1 && newState.p2) {
          const result = Math.random() < 0.5 ? 'heads' : 'tails';
          newState.r = result;
          newState.rd++;

          if (result === newState.p1) newState.s1++;
          if (result === newState.p2) newState.s2++;
        }

        let winner = null;
        let status = 'playing';
        if (newState.s1 >= 3) {
          winner = game.playerX;
          status = 'finished';
        } else if (newState.s2 >= 3) {
          winner = game.playerO;
          status = 'finished';
        }

        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData(newState),
          winner,
          status,
        });

        // Reset for next round
        if (newState.p1 && newState.p2 && status === 'playing') {
          setTimeout(async () => {
            await databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData({ ...newState, p1: null, p2: null, r: null }),
            });
          }, 2500);
        }
      }
    } catch (err) {
      console.error("Guess failed", err);
    } finally {
      setChoosing(false);
    }
  };

  if (loading) return <div>Loading Game...</div>;
  if (!game) return <div>Game not found.</div>;

  const state = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isPlayer1 = game.playerX === userId;
  const myGuess = isPlayer1 ? state.p1 : state.p2;
  const hasGuessed = myGuess !== null;

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

      {/* Score */}
      <div className="flex justify-center gap-8 text-2xl font-bold">
        <div className="text-center">
          <div className="text-sm text-gray-400">You</div>
          <div className="text-blue-400">{isPlayer1 ? state.s1 : state.s2}</div>
        </div>
        <div className="text-gray-500">vs</div>
        <div className="text-center">
          <div className="text-sm text-gray-400">{isSinglePlayer ? 'AI' : 'Opponent'}</div>
          <div className="text-red-400">{isPlayer1 ? state.s2 : state.s1}</div>
        </div>
      </div>

      <div className="text-gray-400">First to 3 wins! (Round {state.rd + 1})</div>

      {/* Coin display */}
      <div className={`w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold shadow-2xl ${
        state.r === 'heads' ? 'bg-yellow-500 text-yellow-900' : 
        state.r === 'tails' ? 'bg-yellow-600 text-yellow-200' : 
        'bg-gray-700 text-gray-500'
      } ${flipping ? 'animate-spin' : ''}`}>
        {state.r ? (state.r === 'heads' ? '👑' : '🦅') : <Coins size={48} />}
      </div>

      {state.r && (
        <div className="text-xl font-bold text-yellow-400 capitalize">{state.r}!</div>
      )}

      {/* Status */}
      <div className="text-center">
        {game.status === 'waiting' ? (
          <div className="animate-pulse text-yellow-500 font-semibold">
            Waiting for opponent...
          </div>
        ) : game.status === 'finished' ? (
          <div className="text-2xl font-bold text-green-500">
            {game.winner === userId ? "You Won! 🎉" : "You Lost!"}
          </div>
        ) : hasGuessed ? (
          <div className="text-xl font-semibold text-gray-400">
            {isSinglePlayer ? 'Flipping...' : 'Waiting for opponent...'}
          </div>
        ) : (
          <div className="text-xl font-semibold text-blue-400">
            Guess heads or tails!
          </div>
        )}
      </div>

      {/* Guess buttons */}
      {game.status === 'playing' && !hasGuessed && !state.r && (
        <div className="flex gap-4">
          <button
            onClick={() => makeGuess('heads')}
            disabled={choosing}
            className="w-28 h-20 bg-yellow-500 hover:bg-yellow-600 text-yellow-900 rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 disabled:opacity-50 font-bold"
          >
            <span className="text-2xl">👑</span>
            <span>Heads</span>
          </button>
          <button
            onClick={() => makeGuess('tails')}
            disabled={choosing}
            className="w-28 h-20 bg-yellow-600 hover:bg-yellow-700 text-yellow-200 rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 disabled:opacity-50 font-bold"
          >
            <span className="text-2xl">🦅</span>
            <span>Tails</span>
          </button>
        </div>
      )}

      <div className="flex gap-4 w-full text-sm mt-4">
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

export default CoinFlipBoard;
