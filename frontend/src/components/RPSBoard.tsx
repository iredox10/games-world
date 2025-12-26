import React, { useState, useEffect } from 'react';
import { databases, client } from '../lib/appwrite';
import { Home, Hand, Scissors, FileText } from 'lucide-react';
import GameChat from './GameChat';

interface RPSBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

type Choice = 'rock' | 'paper' | 'scissors' | null;

interface RPSState {
  player1Choice: Choice;
  player2Choice: Choice;
  player1Score: number;
  player2Score: number;
  round: number;
  roundWinner: string | null;
}

// Helper to parse board data (handles compact format)
const parseBoardData = (boardStr: string): RPSState => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format: {t:'rps', d:{p1,p2,s1,s2,r,w}}
    if (parsed.t === 'rps' && parsed.d) {
      return {
        player1Choice: parsed.d.p1,
        player2Choice: parsed.d.p2,
        player1Score: parsed.d.s1,
        player2Score: parsed.d.s2,
        round: parsed.d.r,
        roundWinner: parsed.d.w,
      };
    }
    // Old format with type/data
    if (parsed.type && parsed.data) {
      return parsed.data;
    }
    // Plain object format
    if (parsed.player1Choice !== undefined) {
      return parsed;
    }
    return {
      player1Choice: null,
      player2Choice: null,
      player1Score: 0,
      player2Score: 0,
      round: 0,
      roundWinner: null,
    };
  } catch {
    return {
      player1Choice: null,
      player2Choice: null,
      player1Score: 0,
      player2Score: 0,
      round: 0,
      roundWinner: null,
    };
  }
};

// Helper to serialize board data
const serializeBoardData = (boardStr: string, newData: RPSState): string => {
  try {
    const parsed = JSON.parse(boardStr);
    // Compact format
    if (parsed.t === 'rps') {
      return JSON.stringify({
        t: 'rps',
        d: {
          p1: newData.player1Choice,
          p2: newData.player2Choice,
          s1: newData.player1Score,
          s2: newData.player2Score,
          r: newData.round,
          w: newData.roundWinner,
        }
      });
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

const RPSBoard: React.FC<RPSBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [showResult, setShowResult] = useState(false);

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

  const getWinner = (choice1: Choice, choice2: Choice): 'player1' | 'player2' | 'draw' => {
    if (choice1 === choice2) return 'draw';
    if (
      (choice1 === 'rock' && choice2 === 'scissors') ||
      (choice1 === 'paper' && choice2 === 'rock') ||
      (choice1 === 'scissors' && choice2 === 'paper')
    ) {
      return 'player1';
    }
    return 'player2';
  };

  const makeChoice = async (choice: Choice) => {
    if (choosing || game.status !== 'playing') return;

    const isSinglePlayer = game.playerO === `${userId}-O`;
    const state: RPSState = parseBoardData(game.board);
    
    const isPlayer1 = game.playerX === userId;
    
    // In multiplayer, check if already made choice
    if (!isSinglePlayer) {
      if (isPlayer1 && state.player1Choice) return;
      if (!isPlayer1 && state.player2Choice) return;
    }

    setChoosing(true);
    try {
      let newState = { ...state };
      
      if (isSinglePlayer) {
        // Solo mode: make both choices and resolve immediately
        const aiChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)] as Choice;
        newState.player1Choice = choice;
        newState.player2Choice = aiChoice;
        
        const roundWinner = getWinner(choice, aiChoice);
        if (roundWinner === 'player1') {
          newState.player1Score++;
          newState.roundWinner = game.playerX;
        } else if (roundWinner === 'player2') {
          newState.player2Score++;
          newState.roundWinner = game.playerO;
        } else {
          newState.roundWinner = 'draw';
        }
        newState.round++;
        
        // Check for game winner (best of 3)
        let winner = null;
        let status = 'playing';
        if (newState.player1Score >= 2) {
          winner = game.playerX;
          status = 'finished';
        } else if (newState.player2Score >= 2) {
          winner = game.playerO;
          status = 'finished';
        }
        
        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData(game.board, newState),
          winner: winner,
          status: status,
        });
        
        setShowResult(true);
        setTimeout(() => {
          setShowResult(false);
          // Reset choices for next round if game continues
          if (status === 'playing') {
            databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData(game.board, { ...newState, player1Choice: null, player2Choice: null, roundWinner: null }),
            });
          }
        }, 2000);
      } else {
        // Multiplayer mode
        if (isPlayer1) {
          newState.player1Choice = choice;
        } else {
          newState.player2Choice = choice;
        }
        
        // If both players have chosen, resolve the round
        if (newState.player1Choice && newState.player2Choice) {
          const roundWinner = getWinner(newState.player1Choice, newState.player2Choice);
          if (roundWinner === 'player1') {
            newState.player1Score++;
            newState.roundWinner = game.playerX;
          } else if (roundWinner === 'player2') {
            newState.player2Score++;
            newState.roundWinner = game.playerO;
          } else {
            newState.roundWinner = 'draw';
          }
          newState.round++;
        }
        
        let winner = null;
        let status = 'playing';
        if (newState.player1Score >= 2) {
          winner = game.playerX;
          status = 'finished';
        } else if (newState.player2Score >= 2) {
          winner = game.playerO;
          status = 'finished';
        }
        
        await databases.updateDocument('main', 'games', gameId, {
          board: serializeBoardData(game.board, newState),
          winner: winner,
          status: status,
        });
        
        // Reset choices after showing result
        if (newState.player1Choice && newState.player2Choice && status === 'playing') {
          setTimeout(() => {
            databases.updateDocument('main', 'games', gameId, {
              board: serializeBoardData(game.board, { ...newState, player1Choice: null, player2Choice: null, roundWinner: null }),
            });
          }, 2000);
        }
      }
    } catch (err) {
      console.error("Choice failed", err);
    } finally {
      setChoosing(false);
    }
  };

  const ChoiceIcon = ({ choice, size = 48 }: { choice: Choice; size?: number }) => {
    if (choice === 'rock') return <Hand size={size} className="rotate-90" />;
    if (choice === 'paper') return <FileText size={size} />;
    if (choice === 'scissors') return <Scissors size={size} />;
    return <div className="w-12 h-12 rounded-full bg-gray-700 animate-pulse" />;
  };

  if (loading) return <div>Loading Game...</div>;
  if (!game) return <div>Game not found.</div>;

  const state: RPSState = parseBoardData(game.board);
  const isSinglePlayer = game.playerO === `${userId}-O`;
  const isPlayer1 = game.playerX === userId;
  const myChoice = isPlayer1 ? state.player1Choice : state.player2Choice;
  const opponentChoice = isPlayer1 ? state.player2Choice : state.player1Choice;
  const hasChosen = myChoice !== null;
  const bothChosen = state.player1Choice && state.player2Choice;

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
        <div className={`text-center ${isPlayer1 ? 'text-blue-400' : 'text-gray-400'}`}>
          <div className="text-sm text-gray-400">You</div>
          <div>{isPlayer1 ? state.player1Score : state.player2Score}</div>
        </div>
        <div className="text-gray-500">vs</div>
        <div className={`text-center ${!isPlayer1 ? 'text-red-400' : 'text-gray-400'}`}>
          <div className="text-sm text-gray-400">{isSinglePlayer ? 'AI' : 'Opponent'}</div>
          <div>{isPlayer1 ? state.player2Score : state.player1Score}</div>
        </div>
      </div>

      <div className="text-gray-400">Round {state.round + 1} of 3 (Best of 3)</div>

      {/* Status */}
      <div className="text-center">
        {game.status === 'waiting' ? (
          <div className="animate-pulse text-yellow-500 font-semibold">
            Waiting for opponent...
          </div>
        ) : game.status === 'finished' ? (
          <div className="text-2xl font-bold text-green-500">
            {game.winner === userId ? "You Won! 🎉" : "Opponent Won!"}
          </div>
        ) : bothChosen || showResult ? (
          <div className="text-xl font-semibold text-yellow-400">
            {state.roundWinner === 'draw' ? "Draw!" : state.roundWinner === userId ? "You win this round!" : "Opponent wins this round!"}
          </div>
        ) : hasChosen ? (
          <div className="text-xl font-semibold text-gray-400">
            Waiting for opponent...
          </div>
        ) : (
          <div className="text-xl font-semibold text-blue-400">
            Make your choice!
          </div>
        )}
      </div>

      {/* Choices display */}
      {(bothChosen || showResult) && (
        <div className="flex justify-center gap-8 my-4">
          <div className="text-center">
            <div className="w-24 h-24 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
              <ChoiceIcon choice={myChoice} />
            </div>
            <div className="mt-2 text-sm">You</div>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400">
              <ChoiceIcon choice={opponentChoice} />
            </div>
            <div className="mt-2 text-sm">{isSinglePlayer ? 'AI' : 'Opponent'}</div>
          </div>
        </div>
      )}

      {/* Choice buttons */}
      {game.status === 'playing' && !hasChosen && !showResult && (
        <div className="flex gap-4">
          {(['rock', 'paper', 'scissors'] as Choice[]).map((choice) => (
            <button
              key={choice}
              onClick={() => makeChoice(choice)}
              disabled={choosing}
              className="w-24 h-24 bg-gray-800 hover:bg-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
            >
              <ChoiceIcon choice={choice} size={36} />
              <span className="text-sm capitalize">{choice}</span>
            </button>
          ))}
        </div>
      )}

      {/* Player info */}
      <div className="flex gap-4 w-full text-sm mt-4">
        <div className={`flex-1 p-3 rounded-lg border ${game.playerX === userId ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">Player 1</div>
          <div className="truncate font-mono text-xs">{game.playerX}</div>
        </div>
        <div className={`flex-1 p-3 rounded-lg border ${game.playerO === userId ? 'border-red-500 bg-red-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <div className="text-gray-400">Player 2</div>
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

export default RPSBoard;
