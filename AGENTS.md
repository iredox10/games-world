# AGENTS.md - Coding Agent Guidelines

## Project Overview
Multi-game arcade web app: React + TypeScript + Vite frontend, Appwrite BaaS backend.
Games: Tic-Tac-Toe, Connect Four, Rock Paper Scissors, Nim, Coin Flip, Number Guess.

## Build & Development

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production (tsc -b && vite build)
npm run lint         # Lint with ESLint
npm run preview      # Preview production build
```

### Appwrite Functions (functions/make-move/)
```bash
cd functions/make-move
bun install                   # Uses Bun
bun run src/main.js           # Test locally
appwrite deploy function      # Deploy to Appwrite
```

## Testing
**No test framework is configured.**
- **Manual Testing**:
  1. `npm run dev` to start the app.
  2. Test gameplay solo.
  3. Test multiplayer using two browser windows/tabs.

## Code Style

### TypeScript Configuration
- **Target**: ES2022, Strict Mode.
- **JSX**: `react-jsx` (automatic runtime).
- **Module Resolution**: Bundler.

### Import Order
1. React/External: `import React, { useState } from 'react';`
2. Appwrite Lib: `import { databases } from '../lib/appwrite';`
3. Icons: `import { Home } from 'lucide-react';`
4. Components: `import GameChat from './GameChat';`
5. Hooks: `import { useSounds } from '../hooks/useSounds';`
6. Utils: `import { playerStats } from '../utils/playerStats';`

### Naming Conventions
- **Components**: PascalCase (e.g., `GameBoard.tsx`)
- **Hooks**: camelCase + "use" (e.g., `useSounds.ts`)
- **Utils/Functions**: camelCase (e.g., `playerStats.ts`)
- **Interfaces**: PascalCase (e.g., `GameBoardProps`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_PLAYERS`)

### Component Pattern
```typescript
interface GameBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const GameBoard: React.FC<GameBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  
  // Hooks & Logic...

  return (
    <div className="glass">...</div>
  );
};

export default GameBoard;
```

### Styling (Tailwind CSS v4)
- Use `@tailwindcss/vite` plugin.
- Custom utility classes: `glass`, `glass-dark`, `gradient-text`, `shimmer`.
- **Theme**: Dark mode with indigo/purple gradients.
- **Responsive**: Mobile-first with `sm:` breakpoints.

### Error Handling
```typescript
try {
  await databases.updateDocument(...);
} catch (err) {
  console.error("Action failed", err);
  // Show simple user feedback if necessary
}
```

## Appwrite Integration

### Configuration
- **Database**: `main`
- **Collections**: `games`, `players`
- **Auth**: Anonymous sessions created automatically.

### Realtime Subscriptions
```typescript
useEffect(() => {
  const unsubscribe = client.subscribe(
    [`databases.main.collections.games.documents.${gameId}`],
    (response) => setGame(response.payload)
  );
  return () => unsubscribe();
}, [gameId]);
```

### Game State (Compact JSON)
Due to Appwrite limits, use compact keys for game board data:
- Tic-Tac-Toe: `{ t: 'ttt', d: [...] }`
- Connect Four: `{ t: 'c4', d: '...' }`
- **Single Player Check**: `const isSinglePlayer = game.playerO === userId + '-O';`

## Environment Variables
```env
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=<project-id>
```
*Never commit `.env` files.*

## Adding a New Game
1. Create `src/components/NewGameBoard.tsx`.
2. Add game type to `GameSelector.tsx`.
3. Add initial board state to `Lobby.tsx`.
4. Add rendering logic to `App.tsx`.
