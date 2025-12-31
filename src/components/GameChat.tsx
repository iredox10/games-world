import React, { useState, useEffect, useRef } from 'react';
import { databases, client } from '../lib/appwrite';
import { MessageCircle, Send, Mic, MicOff, Phone, PhoneOff, X, Volume2, VolumeX } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface GameChatProps {
  gameId: string;
  userId: string;
  opponentId: string | null;
  isSinglePlayer: boolean;
}

// Parse chat from game board - we'll store chat in a compact format
const parseChat = (chatStr: string | undefined): ChatMessage[] => {
  if (!chatStr) return [];
  try {
    const parsed = JSON.parse(chatStr);
    return parsed || [];
  } catch {
    return [];
  }
};

const GameChat: React.FC<GameChatProps> = ({ gameId, userId, opponentId, isSinglePlayer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Voice chat state
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch initial chat and subscribe to updates
  useEffect(() => {
    const fetchChat = async () => {
      try {
        const game = await databases.getDocument('main', 'games', gameId);
        if (game.chat) {
          setMessages(parseChat(game.chat));
        }
      } catch (err) {
        console.error('Failed to fetch chat', err);
      }
    };

    fetchChat();

    // Subscribe to game updates for chat
    const unsubscribe = client.subscribe(
      [`databases.main.collections.games.documents.${gameId}`],
      (response: any) => {
        if (response.payload.chat) {
          const newMessages = parseChat(response.payload.chat);
          setMessages(newMessages);
          
          // Count unread if chat is closed
          if (!isOpen && newMessages.length > messages.length) {
            setUnreadCount(prev => prev + (newMessages.length - messages.length));
          }
        }
        
        // Handle WebRTC signaling
        if (response.payload.rtc) {
          handleRTCSignaling(response.payload.rtc);
        }
      }
    );

    return () => unsubscribe();
  }, [gameId, isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear unread when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Handle remote audio stream
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const message: ChatMessage = {
        id: Date.now().toString(),
        sender: userId,
        text: newMessage.trim(),
        timestamp: Date.now(),
      };

      // Keep only last 50 messages to stay within size limit
      const updatedMessages = [...messages, message].slice(-50);
      
      await databases.updateDocument('main', 'games', gameId, {
        chat: JSON.stringify(updatedMessages),
      });

      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  // WebRTC Voice Chat Functions
  const handleRTCSignaling = async (rtcData: string) => {
    try {
      const signal = JSON.parse(rtcData);
      if (signal.sender === userId) return; // Ignore own signals

      if (signal.type === 'offer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await databases.updateDocument('main', 'games', gameId, {
          rtc: JSON.stringify({ type: 'answer', answer, sender: userId }),
        });
      } else if (signal.type === 'answer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
      } else if (signal.type === 'ice-candidate' && peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('RTC signaling error', err);
    }
  };

  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await databases.updateDocument('main', 'games', gameId, {
            rtc: JSON.stringify({ type: 'ice-candidate', candidate: event.candidate, sender: userId }),
          });
        }
      };

      setPeerConnection(pc);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await databases.updateDocument('main', 'games', gameId, {
        rtc: JSON.stringify({ type: 'offer', offer, sender: userId }),
      });

      setIsVoiceEnabled(true);
    } catch (err) {
      console.error('Failed to start voice chat', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopVoiceChat = () => {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnection?.close();
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
    setIsVoiceEnabled(false);
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleDeafen = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isDeafened;
      setIsDeafened(!isDeafened);
    }
  };

  if (isSinglePlayer) return null;

  return (
    <>
      {/* Hidden audio element for remote stream */}
      <audio ref={audioRef} autoPlay />

      {/* Chat toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg hover:scale-110 transition-all z-50 group"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 glass rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden" style={{ height: '450px' }}>
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Game Chat</h3>
                <p className="text-xs text-gray-500">
                  {opponentId ? 'Connected' : 'Waiting for opponent...'}
                </p>
              </div>
            </div>
            
            {/* Voice controls */}
            <div className="flex items-center gap-1">
              {isVoiceEnabled ? (
                <>
                  <button
                    onClick={toggleMute}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleDeafen}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isDeafened ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    title={isDeafened ? 'Undeafen' : 'Deafen'}
                  >
                    {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={stopVoiceChat}
                    className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                    title="End call"
                  >
                    <PhoneOff className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={startVoiceChat}
                  disabled={!opponentId}
                  className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Start voice chat"
                >
                  <Phone className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Voice chat indicator */}
          {isVoiceEnabled && (
            <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Voice chat active</span>
              {remoteStream && <span className="text-xs text-gray-500">• Connected</span>}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                No messages yet. Say hello! 👋
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === userId ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                      msg.sender === userId
                        ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-md'
                        : 'bg-white/10 text-white rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm break-words">{msg.text}</p>
                    <p className={`text-xs mt-1 ${msg.sender === userId ? 'text-white/60' : 'text-gray-500'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                disabled={!opponentId}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending || !opponentId}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default GameChat;
