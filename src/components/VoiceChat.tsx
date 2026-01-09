import React, { useState } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useVoiceChat } from '../hooks/useVoiceChat';

interface VoiceChatProps {
  gameId: string;
  userId: string;
  isSinglePlayer: boolean;
}

const VoiceChat: React.FC<VoiceChatProps> = ({ gameId, userId, isSinglePlayer }) => {
  const [isActive, setIsActive] = useState(false);
  const { isConnected, isMuted, error, toggleMute } = useVoiceChat({
    gameId,
    userId,
    enabled: isActive,
  });

  if (isSinglePlayer) return null;

  const handleToggleVoice = () => {
    setIsActive(!isActive);
  };

  return (
    <div className="flex items-center gap-2">
      {!isActive ? (
        <button
          onClick={handleToggleVoice}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
          title="Start Voice Chat"
        >
          <Mic size={18} />
          <span className="text-sm font-medium">Voice Chat</span>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg transition-colors ${
              isMuted
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          
          <button
            onClick={handleToggleVoice}
            className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            title="End Voice Chat"
          >
            <PhoneOff size={18} />
          </button>

          {isConnected && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Connected</span>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 max-w-[150px] truncate" title={error}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceChat;
