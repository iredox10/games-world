import React from 'react';
import { Grid3X3, Circle, Hand, Minus, Target, Users, Cpu, Sparkles, Disc, Grid3x3 as GoIcon, Box, Gem } from 'lucide-react';

export type GameType = 'tictactoe' | 'connect4' | 'rps' | 'nim' | 'guess' | 'reversi' | 'go' | 'mancala' | 'dots';

interface GameSelectorProps {
  onSelectGame: (game: GameType) => void;
}

const games = [
  {
    id: 'tictactoe' as GameType,
    name: 'Tic-Tac-Toe',
    description: 'Classic 3x3 grid. Get 3 in a row!',
    icon: Grid3X3,
    gradient: 'from-blue-500 to-cyan-400',
    bgGlow: 'bg-blue-500/20',
    players: '1-2',
  },
  {
    id: 'connect4' as GameType,
    name: 'Connect Four',
    description: 'Drop discs, connect 4 to win!',
    icon: Circle,
    gradient: 'from-yellow-500 to-orange-400',
    bgGlow: 'bg-yellow-500/20',
    players: '1-2',
  },
  {
    id: 'rps' as GameType,
    name: 'Rock Paper Scissors',
    description: 'Best of 3 rounds!',
    icon: Hand,
    gradient: 'from-green-500 to-emerald-400',
    bgGlow: 'bg-green-500/20',
    players: '1-2',
  },
  {
    id: 'nim' as GameType,
    name: 'Nim',
    description: "Take 1-3 sticks. Don't take last!",
    icon: Minus,
    gradient: 'from-amber-500 to-yellow-400',
    bgGlow: 'bg-amber-500/20',
    players: '1-2',
  },
  {
    id: 'guess' as GameType,
    name: 'Number Guess',
    description: 'Guess 1-10. Closest wins!',
    icon: Target,
    gradient: 'from-purple-500 to-pink-400',
    bgGlow: 'bg-purple-500/20',
    players: '1-2',
  },
  {
    id: 'reversi' as GameType,
    name: 'Reversi',
    description: 'Flip pieces to dominate the board!',
    icon: Disc,
    gradient: 'from-gray-600 to-gray-800',
    bgGlow: 'bg-gray-500/20',
    players: '1-2',
  },
  {
    id: 'go' as GameType,
    name: 'Go 9x9',
    description: 'Ancient strategy. Capture territory!',
    icon: GoIcon,
    gradient: 'from-amber-600 to-yellow-500',
    bgGlow: 'bg-amber-500/20',
    players: '1-2',
  },
  {
    id: 'mancala' as GameType,
    name: 'Mancala',
    description: 'Sow seeds, capture stones!',
    icon: Gem,
    gradient: 'from-orange-600 to-red-500',
    bgGlow: 'bg-orange-500/20',
    players: '1-2',
  },
  {
    id: 'dots' as GameType,
    name: 'Dots & Boxes',
    description: 'Draw lines, complete boxes to win!',
    icon: Box,
    gradient: 'from-teal-500 to-cyan-400',
    bgGlow: 'bg-teal-500/20',
    players: '1-2',
  },
];

const GameSelector: React.FC<GameSelectorProps> = ({ onSelectGame }) => {
  return (
    <div className="w-full max-w-5xl px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-gray-300">Choose your game</span>
        </div>
        <h2 className="font-gaming text-4xl md:text-5xl font-bold gradient-text mb-3">
          GAME LIBRARY
        </h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Challenge friends or play solo against AI. Real-time multiplayer powered by Appwrite.
        </p>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game, index) => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className="game-card group relative p-6 rounded-2xl text-left overflow-hidden"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Background glow */}
            <div className={`absolute inset-0 ${game.bgGlow} opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl`} />
            
            {/* Content */}
            <div className="relative z-10">
              {/* Icon */}
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${game.gradient} p-4 mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg`}>
                <game.icon className="w-full h-full text-white" />
              </div>
              
              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 transition-all">
                {game.name}
              </h3>
              
              {/* Description */}
              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {game.description}
              </p>
              
              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Users className="w-3 h-3" />
                  <span>{game.players} Players</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Cpu className="w-3 h-3" />
                  <span>AI</span>
                </div>
              </div>
              
              {/* Play indicator */}
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
            
            {/* Shimmer effect on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute inset-0 shimmer" />
            </div>
          </button>
        ))}
      </div>
      
      {/* Stats bar */}
      <div className="mt-12 glass rounded-2xl p-6 flex flex-wrap items-center justify-center gap-8 md:gap-16">
        <div className="text-center">
          <div className="text-3xl font-bold gradient-text">9</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Games</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-green-400">∞</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Matches</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-purple-400">2</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Play Modes</div>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1 text-3xl font-bold text-yellow-400">
            <span>⚡</span>
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wider">Real-time</div>
        </div>
      </div>
    </div>
  );
};

export default GameSelector;
