import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ICE servers for WebRTC
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
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
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  
  // Use refs for WebRTC to avoid stale closure issues
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const lastRtcTimestampRef = useRef<number>(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cleanup function for voice chat
  const cleanupVoiceChat = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    pendingCandidatesRef.current = [];
    setIsVoiceEnabled(false);
    setVoiceStatus('idle');
  }, []);

  // Create peer connection with proper event handlers
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    // Cleanup existing connection if any
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Handle incoming audio stream
    pc.ontrack = (event) => {
      console.log('Received remote track');
      if (audioRef.current && event.streams[0]) {
        audioRef.current.srcObject = event.streams[0];
        setVoiceStatus('connected');
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await databases.updateDocument('main', 'games', gameId, {
            rtc: JSON.stringify({ 
              type: 'ice-candidate', 
              candidate: event.candidate.toJSON(), 
              sender: userId,
              timestamp: Date.now()
            }),
          });
        } catch (err) {
          console.error('Failed to send ICE candidate', err);
        }
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        setVoiceStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        cleanupVoiceChat();
      }
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, [gameId, userId, cleanupVoiceChat]);

  // Handle incoming RTC signaling
  const handleRTCSignaling = useCallback(async (rtcData: string) => {
    try {
      const signal = JSON.parse(rtcData);
      
      // Ignore own signals
      if (signal.sender === userId) return;
      
      // Ignore duplicate/old signals
      if (signal.timestamp && signal.timestamp <= lastRtcTimestampRef.current) return;
      lastRtcTimestampRef.current = signal.timestamp || Date.now();

      console.log('Received RTC signal:', signal.type);

      if (signal.type === 'offer') {
        // Someone is calling us - set up to receive the call
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          
          const pc = createPeerConnection();
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          
          // Add any pending ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.warn('Failed to add pending candidate', e);
            }
          }
          pendingCandidatesRef.current = [];
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          await databases.updateDocument('main', 'games', gameId, {
            rtc: JSON.stringify({ 
              type: 'answer', 
              answer, 
              sender: userId,
              timestamp: Date.now()
            }),
          });
          
          setIsVoiceEnabled(true);
          setVoiceStatus('connecting');
        } catch (err) {
          console.error('Failed to answer call', err);
          alert('Could not access microphone. Please check permissions.');
        }
        
      } else if (signal.type === 'answer') {
        const pc = peerConnectionRef.current;
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          
          // Add any pending ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.warn('Failed to add pending candidate', e);
            }
          }
          pendingCandidatesRef.current = [];
          setVoiceStatus('connecting');
        }
        
      } else if (signal.type === 'ice-candidate') {
        const pc = peerConnectionRef.current;
        const candidate = new RTCIceCandidate(signal.candidate);
        
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.warn('Failed to add ICE candidate', e);
          }
        } else {
          // Queue the candidate for later
          pendingCandidatesRef.current.push(candidate);
        }
        
      } else if (signal.type === 'hangup') {
        cleanupVoiceChat();
      }
    } catch (err) {
      console.error('RTC signaling error', err);
    }
  }, [userId, gameId, createPeerConnection, cleanupVoiceChat]);

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
          setMessages(prev => {
            // Count unread if chat is closed
            if (!isOpen && newMessages.length > prev.length) {
              setUnreadCount(c => c + (newMessages.length - prev.length));
            }
            return newMessages;
          });
        }
        
        // Handle WebRTC signaling
        if (response.payload.rtc) {
          handleRTCSignaling(response.payload.rtc);
        }
      }
    );

    return () => {
      unsubscribe();
      cleanupVoiceChat();
    };
  }, [gameId, isOpen, handleRTCSignaling, cleanupVoiceChat]);

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

  const startVoiceChat = async () => {
    try {
      setVoiceStatus('connecting');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await databases.updateDocument('main', 'games', gameId, {
        rtc: JSON.stringify({ 
          type: 'offer', 
          offer, 
          sender: userId,
          timestamp: Date.now()
        }),
      });

      setIsVoiceEnabled(true);
    } catch (err) {
      console.error('Failed to start voice chat', err);
      setVoiceStatus('idle');
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopVoiceChat = async () => {
    // Notify the other party
    try {
      await databases.updateDocument('main', 'games', gameId, {
        rtc: JSON.stringify({ 
          type: 'hangup', 
          sender: userId,
          timestamp: Date.now()
        }),
      });
    } catch (err) {
      console.error('Failed to send hangup signal', err);
    }
    
    cleanupVoiceChat();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // Toggle: if muted, enable; if not muted, disable
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
      <audio ref={audioRef} autoPlay playsInline />

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
                  disabled={!opponentId || voiceStatus === 'connecting'}
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
              <div className={`w-2 h-2 rounded-full ${voiceStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-xs text-green-400">
                {voiceStatus === 'connected' ? 'Voice chat connected' : 'Connecting...'}
              </span>
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
