import React, { useState, useEffect } from 'react';
import { Copy, Check, QrCode, Share2, MessageCircle, Send, X } from 'lucide-react';

interface GameShareProps {
  gameId: string;
  gameName: string;
  isOpen: boolean;
  onClose: () => void;
}

const GameShare: React.FC<GameShareProps> = ({ gameId, gameName, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  // Generate the shareable URL
  const baseUrl = window.location.origin;
  const gameUrl = `${baseUrl}?join=${gameId}`;
  
  // QR Code URL using a free QR API
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gameUrl)}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = gameUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyGameId = async () => {
    try {
      await navigator.clipboard.writeText(gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy');
    }
  };

  const shareViaWhatsApp = () => {
    const text = `🎮 Join me for a game of ${gameName}!\n\n${gameUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareViaTelegram = () => {
    const text = `🎮 Join me for a game of ${gameName}!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareViaTwitter = () => {
    const text = `🎮 Join me for a game of ${gameName}!`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl)}`, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my ${gameName} game!`,
          text: `🎮 Let's play ${gameName} together!`,
          url: gameUrl,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowQR(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-6 max-w-md w-full relative animate-float" style={{ animationDuration: '0.3s' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-gaming text-xl text-white mb-1">Invite a Friend</h3>
          <p className="text-gray-400 text-sm">Share this game and play together!</p>
        </div>

        {/* Game Link */}
        <div className="mb-6">
          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Game Link</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gray-300 truncate">
              {gameUrl}
            </div>
            <button
              onClick={copyToClipboard}
              className={`w-12 rounded-xl flex items-center justify-center transition-all ${
                copied 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
              }`}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Game ID (alternative) */}
        <div className="mb-6">
          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Or share Game ID</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-lg text-center text-white tracking-widest">
              {gameId}
            </div>
            <button
              onClick={copyGameId}
              className="w-12 rounded-xl bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white flex items-center justify-center transition-colors"
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="mb-6">
          <button
            onClick={() => setShowQR(!showQR)}
            className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-gray-300"
          >
            <QrCode className="w-5 h-5" />
            <span>{showQR ? 'Hide QR Code' : 'Show QR Code'}</span>
          </button>
          
          {showQR && (
            <div className="mt-4 flex justify-center">
              <div className="bg-white p-3 rounded-xl">
                <img 
                  src={qrCodeUrl} 
                  alt="Game QR Code" 
                  className="w-48 h-48"
                />
              </div>
            </div>
          )}
        </div>

        {/* Share buttons */}
        <div className="space-y-3">
          <label className="text-xs text-gray-500 uppercase tracking-wider block">Share via</label>
          
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={shareViaWhatsApp}
              className="py-3 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-400 flex flex-col items-center gap-1 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-xs">WhatsApp</span>
            </button>
            
            <button
              onClick={shareViaTelegram}
              className="py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 flex flex-col items-center gap-1 transition-colors"
            >
              <Send className="w-5 h-5" />
              <span className="text-xs">Telegram</span>
            </button>
            
            <button
              onClick={shareViaTwitter}
              className="py-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 flex flex-col items-center gap-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span className="text-xs">X</span>
            </button>
          </div>

          {/* Native share (mobile) */}
          {'share' in navigator && (
            <button
              onClick={shareNative}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium flex items-center justify-center gap-2 transition-all"
            >
              <Share2 className="w-5 h-5" />
              <span>More Sharing Options</span>
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-sm text-blue-300">
            <span className="font-semibold">💡 Tip:</span> Your friend can click the link or enter the Game ID to join instantly!
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameShare;
