import { useEffect, useRef, useState } from 'react';
import { client, databases } from '../lib/appwrite';

interface UseVoiceChatProps {
  gameId: string;
  userId: string;
  enabled: boolean;
}

type RtcSignal =
  | { t: 'offer'; from: string; sdp: string; v: number }
  | { t: 'answer'; from: string; sdp: string; v: number };

export const useVoiceChat = ({ gameId, userId, enabled }: UseVoiceChatProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSignalVersionRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      try {
        const game = await databases.getDocument('main', 'games', gameId);
        const isSinglePlayer = game.playerO === `${userId}-O`;
        if (isSinglePlayer) return;

        const isInitiator = game.playerX === userId;
        await initPeerConnection(isInitiator);

        unsubscribe = client.subscribe(
          [`databases.main.collections.games.documents.${gameId}`],
          (response) => {
            const payload: any = response.payload;
            const rtcStr = payload?.rtc;
            if (!rtcStr || typeof rtcStr !== 'string') return;

            let signal: RtcSignal | null = null;
            try {
              signal = JSON.parse(rtcStr);
            } catch {
              return;
            }

            if (!signal || signal.from === userId) return;
            if (signal.v <= lastSignalVersionRef.current) return;
            lastSignalVersionRef.current = signal.v;

            void handleSignal(signal, isInitiator);
          }
        );

        // If initiator, immediately publish offer
        if (isInitiator) {
          void createAndSendOffer();
        }
      } catch (err) {
        console.error('Voice chat start error:', err);
        setError(err instanceof Error ? err.message : 'Failed to start voice chat');
      }
    };

    void start();

    return () => {
      if (unsubscribe) unsubscribe();
      cleanup();
    };
  }, [enabled, gameId, userId]);

  const waitForIceGatheringComplete = async (pc: RTCPeerConnection) => {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  };

  const publishSignal = async (signal: RtcSignal) => {
    await databases.updateDocument('main', 'games', gameId, {
      rtc: JSON.stringify(signal),
    });
  };

  const initPeerConnection = async (_isInitiator: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
          remoteAudioRef.current.autoplay = true;
        }
        remoteAudioRef.current.srcObject = event.streams[0];
      };

      pc.onconnectionstatechange = () => {
        setIsConnected(pc.connectionState === 'connected');
      };

      setError(null);
    } catch (err) {
      console.error('Voice chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to access microphone');
    }
  };

  const createAndSendOffer = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) return;

    const signal: RtcSignal = { t: 'offer', from: userId, sdp, v: Date.now() };
    await publishSignal(signal);
  };

  const createAndSendAnswer = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) return;

    const signal: RtcSignal = { t: 'answer', from: userId, sdp, v: Date.now() };
    await publishSignal(signal);
  };

  const handleSignal = async (signal: RtcSignal, isInitiator: boolean) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (signal.t === 'offer' && !isInitiator) {
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await createAndSendAnswer();
      return;
    }

    if (signal.t === 'answer' && isInitiator) {
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current = null;
    }
    setIsConnected(false);
    setIsMuted(false);
    setError(null);
    lastSignalVersionRef.current = 0;
  };

  return {
    isConnected,
    isMuted,
    error,
    toggleMute,
  };
};
