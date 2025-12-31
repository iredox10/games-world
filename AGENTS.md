# AGENTS.md - Coding Agent Guidelines

## Project Overview

Multi-game arcade web app: React + TypeScript + Vite frontend, Appwrite BaaS backend. Games: Tic-Tac-Toe, Connect Four, Rock Paper Scissors, Nim, Coin Flip, Number Guess.

## Build & Development

```bash
npm install          # Install dependencies
npm run dev          # Development server
npm run build        # Build (tsc -b && vite build)
npm run lint         # Lint with ESLint
npm run preview      # Preview production build
```

### Appwrite Functions (functions/make-move/)

```bash
cd functions/make-move
bun install                   # Uses Bun, not npm
bun run src/main.js           # Test locally
appwrite deploy function      # Deploy to Appwrite
```

## Project Structure

```
src/
  components/     # React components (GameBoard, Lobby, etc.)
  hooks/          # Custom hooks (useSounds)
  lib/            # Appwrite client config
  utils/          # Utility functions (playerStats)
  App.tsx         # Main app with routing
functions/
  make-move/      # Appwrite serverless function (CommonJS)
```

## Code Style

### TypeScript

- Target: ES2022, strict mode, no unused locals/parameters
- JSX: react-jsx (automatic runtime)
- Module: ESNext with bundler resolution

### Import Order

```typescript
import React, { useState, useEffect } from 'react';  // 1. React/external
import { databases, client } from '../lib/appwrite'; // 2. Lib
import { Home, Share2 } from 'lucide-react';         // 3. Icons
import GameChat from './GameChat';                    // 4. Components
import { useSounds } from '../hooks/useSounds';       // 5. Hooks
import { updatePlayerStats } from '../utils/playerStats'; // 6. Utils
```

### Component Pattern

```typescript
interface GameBoardProps {
  gameId: string;
  userId: string;
  onQuit: () => void;
}

const GameBoard: React.FC<GameBoardProps> = ({ gameId, userId, onQuit }) => {
  const [game, setGame] = useState<any>(null);
  // ...
};

export default GameBoard;
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | GameBoard.tsx |
| Hooks | camelCase + "use" | useSounds.ts |
| Utils | camelCase | playerStats.ts |
| Interfaces | PascalCase + suffix | GameBoardProps |
| Constants | UPPER_SNAKE_CASE | ROWS, COLS |

### Error Handling

```typescript
try {
  const doc = await databases.getDocument('main', 'games', gameId);
  setGame(doc);
} catch (err) {
  console.error("Failed to fetch game", err);
  alert("Error message");  // Simple user feedback
}
```

### Styling

- Tailwind CSS v4 via @tailwindcss/vite plugin
- Custom classes: `glass`, `glass-dark`, `gradient-text`, `shimmer`
- Dark theme with indigo/purple gradients
- Mobile-first with `sm:` breakpoints

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

### Game State Serialization

Compact JSON format (Appwrite 100-char limit):

```typescript
// Tic-Tac-Toe: {t:'ttt', d:[9 cells]}
// Connect Four: {t:'c4', d:'42 comma-separated cells'}
// RPS: {t:'rps', d:{p1:null,p2:null,s1:0,s2:0,r:0,w:null}}

// Single-player detection
const isSinglePlayer = game.playerO === `${userId}-O`;
```

## Appwrite Backend

- Database ID: `main`
- Collections: `games`, `players`
- Anonymous auth creates sessions automatically
- Permissions: any user can read/update games (for multiplayer)

### Function Pattern (CommonJS)

```javascript
const sdk = require("node-appwrite");

module.exports = async function (context) {
  const { req, res, log, error } = context;
  
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const userId = req.headers["x-appwrite-user-id"];
  
  return res.json({ success: true });
};
```

## Testing

No test framework. Manual testing:
1. `npm run dev` - Start dev server
2. Solo game - Test gameplay alone
3. Two browser tabs - Test multiplayer

## Adding a New Game

1. Create `src/components/NewGameBoard.tsx`
2. Add game type to `GameSelector.tsx`
3. Add board format to `Lobby.tsx` getInitialBoard()
4. Add case to `App.tsx` renderGameBoard()

## Sounds

```typescript
import { useSounds } from '../hooks/useSounds';
const { play } = useSounds();
play('move');  // 'move' | 'win' | 'lose' | 'draw' | 'click' | 'notification' | 'join'
```

## Environment Variables

```env
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=<project-id>
```

Do not commit `.env` files (contains API keys).
