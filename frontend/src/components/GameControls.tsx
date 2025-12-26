import React, { useState, useEffect } from 'react';
import { databases } from '../lib/appwrite';
import { 
  Pause, 
  Play, 
  RotateCcw, 
  Flag, 
  RefreshCw, 
  Clock,
  Trophy,
  X
} from 'lucide-react';

interface GameControlsProps {
  gameId: string;
  userId: string;
  game: any;
  isSinglePlayer: boolean;
  onRestart: () => void;
}

interface GameControlState {
  isPaused: boolean;
  pausedBy: string | null;
  rematchRequested: string | null;
  startTime: number;
}

const parseControlState = (stateStr: string | undefined): GameControlState => {
  if (!stateStr) {
    return { isPaused: false, pausedBy: null, rematchRequested: null, startTime: Date.now() };
  }
  try {
    return JSON.parse(stateStr);
  } catch {
    return { isPaused: false, pausedBy: null, rematchRequested: null, startTime: Date.now() };
  }
};

const GameControls: React.FC<GameControlsProps> = ({ 
  gameId, 
  userId, 
  game, 
  isSinglePlayer,
  onRestart,
}) => {
  const [controlState, setControlState] = useState<GameControlState>(
    parseControlState(game.controls)
  );
  const [showConfirm, setShowConfirm] = useState<'forfeit' | 'restart' | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [loading, setLoading] = useState(false);

  // Update control state when game updates
  useEffect(() => {
    setControlState(parseControlState(game.controls));
  }, [game.controls]);

  // Timer
  useEffect(() => {
    if (game.status !== 'playing' || controlState.isPaused) return;
    
    const startTime = controlState.startTime || Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [game.status, controlState.isPaused, controlState.startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const updateControls = async (newState: Partial<GameControlState>) => {
    setLoading(true);
    try {
      const updated = { ...controlState, ...newState };
      await databases.updateDocument('main', 'games', gameId, {
        controls: JSON.stringify(updated),
      });
      setControlState(updated);
    } catch (err) {
      console.error('Failed to update controls', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (isSinglePlayer) {
      setControlState(prev => ({ ...prev, isPaused: !prev.isPaused }));
    } else {
      await updateControls({ 
        isPaused: !controlState.isPaused, 
        pausedBy: controlState.isPaused ? null : userId 
      });
    }
  };

  const handleForfeit = async () => {
    setLoading(true);
    try {
      const winner = game.playerX === userId ? game.playerO : game.playerX;
      await databases.updateDocument('main', 'games', gameId, {
        winner: winner,
        status: 'finished',
      });
    } catch (err) {
      console.error('Failed to forfeit', err);
    } finally {
      setLoading(false);
      setShowConfirm(null);
    }
  };

  const handleRestart = async () => {
    if (isSinglePlayer) {
      onRestart();
    } else {
      // Request rematch
      if (controlState.rematchRequested && controlState.rematchRequested !== userId) {
        // Both players agreed, restart
        onRestart();
      } else {
        await updateControls({ rematchRequested: userId });
      }
    }
    setShowConfirm(null);
  };

  const handleDeclineRematch = async () => {
    await updateControls({ rematchRequested: null });
  };

  const isGameOver = game.status === 'finished';
  const isWaiting = game.status === 'waiting';
  const opponentRequestedRematch = controlState.rematchRequested && controlState.rematchRequested !== userId;
  const iRequestedRematch = controlState.rematchRequested === userId;

  return (
    <>
      {/* Game Timer & Status Bar */}
      <div className="w-full glass rounded-xl p-3 flex items-center justify-between">
        {/* Timer */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="font-mono text-sm text-gray-300">{formatTime(elapsedTime)}</span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {controlState.isPaused && (
            <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium flex items-center gap-1">
              <Pause className="w-3 h-3" /> Paused
            </span>
          )}
          {isWaiting && (
            <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium animate-pulse">
              Waiting...
            </span>
          )}
          {isGameOver && (
            <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center gap-1">
              <Trophy className="w-3 h-3" /> Game Over
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* Pause/Resume - only during active game */}
          {!isGameOver && !isWaiting && (
            <button
              onClick={handlePause}
              disabled={loading}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                controlState.isPaused 
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                  : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
              }`}
              title={controlState.isPaused ? 'Resume' : 'Pause'}
            >
              {controlState.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {/* Restart/Rematch */}
          <button
            onClick={() => setShowConfirm('restart')}
            disabled={loading || isWaiting}
            className="w-8 h-8 rounded-lg bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
            title={isGameOver ? 'Rematch' : 'Restart'}
          >
            {isGameOver ? <RefreshCw className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
          </button>

          {/* Forfeit - only during active game in multiplayer */}
          {!isGameOver && !isWaiting && !isSinglePlayer && (
            <button
              onClick={() => setShowConfirm('forfeit')}
              disabled={loading}
              className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-colors"
              title="Forfeit"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Paused Overlay */}
      {controlState.isPaused && !isGameOver && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="glass rounded-2xl p-8 text-center max-w-sm mx-4">
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Pause className="w-8 h-8 text-yellow-400" />
            </div>
            <h3 className="font-gaming text-2xl text-white mb-2">Game Paused</h3>
            <p className="text-gray-400 text-sm mb-6">
              {isSinglePlayer 
                ? 'Take your time!' 
                : controlState.pausedBy === userId 
                  ? 'You paused the game' 
                  : 'Opponent paused the game'}
            </p>
            {(isSinglePlayer || controlState.pausedBy === userId) && (
              <button
                onClick={handlePause}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 font-semibold text-white transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" /> Resume Game
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rematch Request Notification */}
      {opponentRequestedRematch && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 glass rounded-xl p-4 z-40 flex items-center gap-4 animate-float">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-medium">Rematch Requested!</p>
            <p className="text-gray-400 text-sm">Your opponent wants to play again</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRestart}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
            >
              Accept
            </button>
            <button
              onClick={handleDeclineRematch}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* I Requested Rematch */}
      {iRequestedRematch && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 glass rounded-xl p-4 z-40 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-300 text-sm">Waiting for opponent to accept rematch...</span>
          <button
            onClick={handleDeclineRematch}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation Modals */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-6 max-w-sm w-full">
            <div className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
              showConfirm === 'forfeit' ? 'bg-red-500/20' : 'bg-blue-500/20'
            }`}>
              {showConfirm === 'forfeit' 
                ? <Flag className="w-7 h-7 text-red-400" />
                : <RotateCcw className="w-7 h-7 text-blue-400" />
              }
            </div>
            
            <h3 className="text-xl font-bold text-white text-center mb-2">
              {showConfirm === 'forfeit' ? 'Forfeit Game?' : (isGameOver ? 'Request Rematch?' : 'Restart Game?')}
            </h3>
            
            <p className="text-gray-400 text-sm text-center mb-6">
              {showConfirm === 'forfeit' 
                ? 'You will lose this game. This action cannot be undone.'
                : isGameOver
                  ? isSinglePlayer 
                    ? 'Start a new game with the same settings.'
                    : 'Send a rematch request to your opponent.'
                  : isSinglePlayer
                    ? 'Reset the game and start over.'
                    : 'Both players need to agree to restart.'}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showConfirm === 'forfeit' ? handleForfeit : handleRestart}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl font-medium text-white transition-colors disabled:opacity-50 ${
                  showConfirm === 'forfeit'
                    ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500'
                }`}
              >
                {loading ? 'Please wait...' : showConfirm === 'forfeit' ? 'Forfeit' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GameControls;
