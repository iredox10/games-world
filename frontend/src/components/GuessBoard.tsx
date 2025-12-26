import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Target } from 'lucide-react';
import GameChat from './GameChat';

interface GuessBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

interface GuessState {
  n: number;      // secret number (1-10)
  g1: number | null; // player 1 guess
  g2: number | null; // player 2 guess
  s1: number;     // score 1
  s2: number;     // score 2
  rd: number;     // round
  w: string | null; // round winner
}

// Helper to parse board data
const parseBoardData = (boardStr: string): GuessState => {
  try {
    const parsed = JSON.parse(boardStr);
    if (parsed.t === 'guess' && parsed.d) {
      return parsed.d;
    }
    return { n: Math.floor(Math.random() * 10) + 1, g1: null, g2: null, s1: 0, s2: 0, rd: 0, w: null };
  } catch {
    return { n: Math.floor(Math.random() * 10) + 1, g1: null, g2: null, s1: 0, s2: 0, rd: 0, w: null };
  }
};

// Helper to serialize board data
const serializeBoardData = (state: GuessState): string => {
  return JSON.stringify({ t: 'guess', d: state });
};

const GuessBoard: React.FC<GuessBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [guessing, setGuessing] = useState(false);
  const [selectedNum, setSelectedNum] = useState<number | null>(null);

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

  const makeGuess = async () => {
    if (guessing || game.status !== 'playing' || selectedNum === null) return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const state = parseBoardData(game.board);
    const isPlayer1 = game.playerX === userId;

    if (!isSinglePlayer) {
      if (isPlayer1 && state.g1 !== null) return;
      if (!isPlayer1 && state.g2 !== null) return;
    }

    setGuessing(true);
    try {
      let newState = { ...state };

      if (isSinglePlayer) {
        // AI guesses a random number
        const aiGuess = Math.floor(Math.random() * 10) + 1;
        newState.g1 = selectedNum;
        newState.g2 = aiGuess;
        
        // Determine who's closer
        const p1Diff = Math.abs(selectedNum - state.n);
        const p2Diff = Math.abs(aiGuess - state.n);
        
        if (p1Diff < p2Diff) {
          newState.s1++;
          newState.w = game.playerX;
        } else if (p2Diff < p1Diff) {
          newState.s2++;
          newState.w = game.playerO;
        } else {
          newState.w = 'tie';
        }
        newState.rd++;

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
          if (status === 'playing') {
            const nextNum = Math.floor(Math.random() * 10) + 1;
            await databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData({ ...newState, n: nextNum, g1: null, g2: null, w: null }),
            });
            setSelectedNum(null);
          }
        }, 3000);
      } else {
        // Multiplayer
        if (isPlayer1) newState.g1 = selectedNum;
        else newState.g2 = selectedNum;

        // If both guessed, determine winner
        if (newState.g1 !== null && newState.g2 !== null) {
          const p1Diff = Math.abs(newState.g1 - state.n);
          const p2Diff = Math.abs(newState.g2 - state.n);
          
          if (p1Diff < p2Diff) {
            newState.s1++;
            newState.w = game.playerX;
          } else if (p2Diff < p1Diff) {
            newState.s2++;
            newState.w = game.playerO;
          } else {
            newState.w = 'tie';
          }
          newState.rd++;
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
        if (newState.g1 !== null && newState.g2 !== null && status === 'playing') {
          setTimeout(async () => {
            const nextNum = Math.floor(Math.random() * 10) + 1;
            await databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData({ ...newState, n: nextNum, g1: null, g2: null, w: null }),
            });
            setSelectedNum(null);
          }, 3000);
        }
      }
    } catch (err) {
      console.error("Guess failed", err);
    } finally {
      setGuessing(false);
    }
  };

  if (loading) return <div>Loading Game...</div>;
  if (!game) return <div>Game not found.</div>;

  const state = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isPlayer1 = game.playerX === userId;
  const myGuess = isPlayer1 ? state.g1 : state.g2;
  const hasGuessed = myGuess !== null;
  const bothGuessed = state.g1 !== null && state.g2 !== null;

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

      <div className="text-gray-400 text-center">
        Guess the secret number! Closest wins.<br/>
        First to 3 wins! (Round {state.rd + 1})
      </div>

      {/* Secret number reveal */}
      {bothGuessed && (
        <div className="text-center">
          <div className="text-gray-400 text-sm">Secret Number Was:</div>
          <div className="text-5xl font-bold text-purple-500">{state.n}</div>
          <div className="mt-2 flex justify-center gap-8 text-sm">
            <div>You: <span className="font-bold text-blue-400">{myGuess}</span></div>
            <div>{isSinglePlayer ? 'AI' : 'Opponent'}: <span className="font-bold text-red-400">{isPlayer1 ? state.g2 : state.g1}</span></div>
          </div>
          {state.w && (
            <div className={`mt-2 font-bold ${state.w === 'tie' ? 'text-yellow-400' : state.w === userId ? 'text-green-400' : 'text-red-400'}`}>
              {state.w === 'tie' ? "It's a tie!" : state.w === userId ? 'You won this round!' : 'Opponent won this round!'}
            </div>
          )}
        </div>
      )}

      {/* Target icon when not revealed */}
      {!bothGuessed && (
        <div className="w-24 h-24 bg-purple-900/50 rounded-full flex items-center justify-center">
          <Target size={48} className="text-purple-400" />
        </div>
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
        ) : hasGuessed && !bothGuessed ? (
          <div className="text-xl font-semibold text-gray-400">
            Waiting for opponent's guess...
          </div>
        ) : !hasGuessed ? (
          <div className="text-xl font-semibold text-blue-400">
            Pick a number (1-10)
          </div>
        ) : null}
      </div>

      {/* Number picker */}
      {game.status === 'playing' && !hasGuessed && (
        <>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                onClick={() => setSelectedNum(num)}
                className={`w-12 h-12 rounded-lg font-bold text-lg transition-all ${
                  selectedNum === num 
                    ? 'bg-purple-600 text-white scale-110' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          <button
            onClick={makeGuess}
            disabled={guessing || selectedNum === null}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 px-8 py-3 rounded-lg font-bold transition-all"
          >
            {guessing ? 'Guessing...' : 'Submit Guess'}
          </button>
        </>
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

export default GuessBoard;
