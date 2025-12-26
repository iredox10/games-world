import React from 'react';
import { HelpCircle, UserPlus, PlayCircle, ShieldCheck } from 'lucide-react';

const UserManual: React.FC = () => {
  return (
    <div className="w-full max-w-md bg-gray-800/50 border border-gray-700 rounded-xl p-6 mt-8 text-left">
      <div className="flex items-center gap-2 mb-4 text-blue-400">
        <HelpCircle size={20} />
        <h2 className="text-xl font-bold">How to Play</h2>
      </div>
      
      <div className="space-y-4 text-sm text-gray-300">
        <section className="flex gap-3">
          <div className="mt-1 bg-blue-500/20 p-1 rounded">
            <UserPlus size={16} className="text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-white">1. Starting a Game</p>
            <p>Click "Create New Game" to host. Copy the Game ID and send it to your friend.</p>
          </div>
        </section>

        <section className="flex gap-3">
          <div className="mt-1 bg-green-500/20 p-1 rounded">
            <PlayCircle size={16} className="text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-white">2. Joining</p>
            <p>Your friend should paste the Game ID into the "Join Game" box and click Join.</p>
          </div>
        </section>

        <section className="flex gap-3">
          <div className="mt-1 bg-purple-500/20 p-1 rounded">
            <ShieldCheck size={16} className="text-purple-400" />
          </div>
          <div>
            <p className="font-semibold text-white">3. Gameplay & Security</p>
            <p>Players take turns (X starts). All moves are validated by Appwrite Functions to ensure fair play.</p>
          </div>
        </section>

        <div className="pt-2 border-t border-gray-700 mt-4 italic text-xs text-gray-400">
          Tip: You can play against yourself by opening another browser tab!
        </div>
      </div>
    </div>
  );
};

export default UserManual;
