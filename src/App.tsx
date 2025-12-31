import { useState, useEffect } from 'react';
import { account, databases } from './lib/appwrite';
import GameSelector, { type GameType } from './components/GameSelector';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import ConnectFourBoard from './components/ConnectFourBoard';
import RPSBoard from './components/RPSBoard';
import NimBoard from './components/NimBoard';
import CoinFlipBoard from './components/CoinFlipBoard';
import GuessBoard from './components/GuessBoard';
import PlayerProfile from './components/PlayerProfile';
import Leaderboard from './components/Leaderboard';
import GameHistory from './components/GameHistory';
import { useSounds } from './hooks/useSounds';
import { Trophy, User, History, Volume2, VolumeX } from 'lucide-react';

function App() {
  const [user, setUser] = useState<any>(null);
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [currentGameType, setCurrentGameType] = useState<GameType | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Modal states
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Sound
  const { play, toggleMute, isMuted } = useSounds();

  // Check for game ID in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinGameId = urlParams.get('join');
    if (joinGameId) {
      // Clear the URL parameter without reload
      window.history.replaceState({}, '', window.location.pathname);
      // Will join after auth
      sessionStorage.setItem('pendingJoinGame', joinGameId);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
      } catch (err) {
        // Create anonymous session if not logged in
        try {
          await account.createAnonymousSession();
          const currentUser = await account.get();
          setUser(currentUser);
        } catch (authErr: any) {
          console.error("Auth failed", authErr);
          setAuthError(authErr?.message || "Authentication failed");
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Auto-join game from URL after auth is complete
  useEffect(() => {
    if (user && !loading) {
      const pendingJoin = sessionStorage.getItem('pendingJoinGame');
      if (pendingJoin) {
        sessionStorage.removeItem('pendingJoinGame');
        handleJoinGame(pendingJoin);
      }
    }
  }, [user, loading]);

  const handleJoinGame = async (id: string, autoJoin: boolean = false) => {
    // Fetch the game to get its type
    try {
      const game = await databases.getDocument('main', 'games', id);
      
      // Auto-join if coming from URL and game is waiting
      if (autoJoin || game.status === 'waiting') {
        if (game.playerX !== user?.$id && !game.playerO) {
          await databases.updateDocument('main', 'games', id, {
            playerO: user.$id,
            status: 'playing',
          });
        }
      }
      
      // Extract game type from board field
      let gameType: GameType = 'tictactoe';
      try {
        const boardData = JSON.parse(game.board);
        if (boardData.t === 'c4') gameType = 'connect4';
        else if (boardData.t === 'rps') gameType = 'rps';
        else if (boardData.t === 'ttt') gameType = 'tictactoe';
        else if (boardData.t === 'nim') gameType = 'nim';
        else if (boardData.t === 'coin') gameType = 'coin';
        else if (boardData.t === 'guess') gameType = 'guess';
        else if (boardData.type) {
          gameType = boardData.type;
        }
      } catch {
        // Old format or plain array
      }
      setCurrentGameType(gameType);
      setGameId(id);
    } catch (err) {
      console.error("Failed to fetch game type", err);
      setGameId(id);
      setCurrentGameType(selectedGame || 'tictactoe');
    }
  };

  const handleQuit = () => {
    setGameId(null);
    setCurrentGameType(null);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
    setGameId(null);
    setCurrentGameType(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
          </div>
          <h2 className="font-gaming text-xl text-white mb-2">Loading</h2>
          <p className="text-gray-500 text-sm">Preparing your arcade experience...</p>
        </div>
      </div>
    );
  }

  if (authError || !user) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-gaming text-2xl text-white mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-6">{authError || "Failed to create session. Please try again."}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold text-white transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const renderGameBoard = () => {
    if (!gameId) return null;
    
    const gameType = currentGameType || 'tictactoe';
    
    switch (gameType) {
      case 'connect4':
        return <ConnectFourBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
      case 'rps':
        return <RPSBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
      case 'nim':
        return <NimBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
      case 'coin':
        return <CoinFlipBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
      case 'guess':
        return <GuessBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
      case 'tictactoe':
      default:
        return <GameBoard gameId={gameId} userId={user.$id} onQuit={handleQuit} />;
    }
  };

  return (
    <div className="min-h-screen bg-pattern">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-fuchsia-500/5 rounded-full blur-3xl animate-float" />
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="glass-dark sticky top-0 z-50 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={handleBackToGames}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center glow-purple">
                <span className="text-xl">🎮</span>
              </div>
              <div>
                <h1 className="font-gaming text-2xl font-bold gradient-text group-hover:opacity-80 transition-opacity">
                  ARCADE
                </h1>
                <p className="text-xs text-gray-500 -mt-1">Play & Compete</p>
              </div>
            </div>
            
            {user && (
              <div className="flex items-center gap-2">
                {/* Sound Toggle */}
                <button
                  onClick={() => {
                    toggleMute();
                    if (!isMuted) play('click');
                  }}
                  className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-gray-500" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                
                {/* History */}
                <button
                  onClick={() => {
                    play('click');
                    setShowHistory(true);
                  }}
                  className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
                  title="Game History"
                >
                  <History className="w-5 h-5 text-gray-400" />
                </button>
                
                {/* Leaderboard */}
                <button
                  onClick={() => {
                    play('click');
                    setShowLeaderboard(true);
                  }}
                  className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
                  title="Leaderboard"
                >
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </button>
                
                {/* Profile */}
                <button
                  onClick={() => {
                    play('click');
                    setShowProfile(true);
                  }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold hover:scale-105 transition-transform"
                  title="Profile"
                >
                  <User className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Modals */}
        <PlayerProfile
          userId={user?.$id || ''}
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
        />
        <Leaderboard
          isOpen={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
          currentUserId={user?.$id || ''}
        />
        <GameHistory
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          userId={user?.$id || ''}
          onReplayGame={(id) => {
            setShowHistory(false);
            handleJoinGame(id);
          }}
        />

        {/* Main content area */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          {gameId ? (
            <div className="w-full max-w-2xl">
              {renderGameBoard()}
            </div>
          ) : !selectedGame ? (
            <GameSelector onSelectGame={setSelectedGame} />
          ) : (
            <Lobby 
              gameType={selectedGame}
              onJoinGame={handleJoinGame}
              onBack={() => setSelectedGame(null)}
              userId={user.$id}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="glass-dark px-6 py-4 mt-auto">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500">
            <p>© 2024 Game Arcade</p>
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Online
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
