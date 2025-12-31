import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, SwitchCamera, Flashlight } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (gameId: string) => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ isOpen, onClose, onScan }) => {
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const startScanner = async () => {
      try {
        // Get available cameras
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          setHasPermission(true);

          // Initialize scanner
          const scanner = new Html5Qrcode('qr-reader');
          scannerRef.current = scanner;

          // Prefer back camera on mobile
          const backCamera = devices.find(
            (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')
          );
          const cameraId = backCamera?.id || devices[0].id;
          const cameraIndex = devices.findIndex((d) => d.id === cameraId);
          setCurrentCameraIndex(cameraIndex >= 0 ? cameraIndex : 0);

          await scanner.start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1,
            },
            (decodedText) => {
              handleScan(decodedText);
            },
            () => {
              // QR code not found in frame - ignore
            }
          );
        } else {
          setError('No cameras found on this device');
          setHasPermission(false);
        }
      } catch (err: any) {
        console.error('Scanner error:', err);
        if (err.toString().includes('Permission')) {
          setError('Camera permission denied. Please allow camera access and try again.');
          setHasPermission(false);
        } else {
          setError('Failed to start camera. Please try again.');
        }
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleScan = (decodedText: string) => {
    // Extract game ID from URL or use as-is
    let gameId = decodedText;

    // Check if it's a URL with ?join= parameter
    try {
      const url = new URL(decodedText);
      const joinParam = url.searchParams.get('join');
      if (joinParam) {
        gameId = joinParam;
      }
    } catch {
      // Not a URL, use as-is (might be just a game ID)
    }

    // Stop scanner and trigger callback
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        onScan(gameId);
        onClose();
      }).catch(console.error);
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1 || !scannerRef.current) return;

    try {
      await scannerRef.current.stop();
      
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);

      await scannerRef.current.start(
        cameras[nextIndex].id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error('Failed to switch camera:', err);
    }
  };

  const handleClose = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(console.error);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-6 max-w-md w-full relative">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-gaming text-xl text-white mb-1">Scan QR Code</h3>
          <p className="text-gray-400 text-sm">Point your camera at a game QR code</p>
        </div>

        {/* Scanner container */}
        <div className="relative">
          <div
            id="qr-reader"
            ref={containerRef}
            className="w-full aspect-square rounded-xl overflow-hidden bg-black/50"
          />
          
          {/* Scanning overlay */}
          {hasPermission && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner brackets */}
              <div className="absolute top-4 left-4 w-12 h-12 border-l-4 border-t-4 border-cyan-400 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-12 h-12 border-r-4 border-t-4 border-cyan-400 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-12 h-12 border-l-4 border-b-4 border-cyan-400 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-12 h-12 border-r-4 border-b-4 border-cyan-400 rounded-br-lg" />
              
              {/* Scan line animation */}
              <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse top-1/2" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl">
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                  <X className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {hasPermission === null && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Requesting camera access...</p>
              </div>
            </div>
          )}
        </div>

        {/* Camera switch button */}
        {cameras.length > 1 && hasPermission && (
          <div className="flex justify-center mt-4">
            <button
              onClick={switchCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <SwitchCamera className="w-5 h-5" />
              <span className="text-sm">Switch Camera</span>
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <p className="text-sm text-cyan-300">
            <span className="font-semibold">Tip:</span> Ask your friend to show their game's QR code, then scan it to join instantly!
          </p>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
