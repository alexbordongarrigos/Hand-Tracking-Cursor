/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Camera, MousePointer2, Settings, Info, Crosshair, Target, Settings2, X } from 'lucide-react';

// Smoothing factor for cursor movement (0 to 1, higher is smoother but slower)
const DEFAULT_SMOOTHING = 0.7;
// Threshold for pinch detection (normalized distance)
const PINCH_THRESHOLD = 0.04;
// Scale factor to map a smaller central area of the camera to the full screen
const DEFAULT_SCALE_FACTOR = 1.5;

type GestureAction = 'none' | 'click_left' | 'click_right' | 'drag' | 'scroll' | 'volume_up' | 'volume_down' | 'brightness_up' | 'brightness_down' | 'key_space' | 'key_enter' | 'key_f1' | 'key_f2' | 'key_f3' | 'key_f4' | 'key_f5' | 'key_f6' | 'key_f7' | 'key_f8' | 'key_f9' | 'key_f10' | 'key_f11' | 'key_f12';
const GESTURE_OPTIONS: { value: GestureAction; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'click_left', label: 'Click Izquierdo' },
  { value: 'click_right', label: 'Click Derecho' },
  { value: 'drag', label: 'Arrastrar (Hold)' },
  { value: 'scroll', label: 'Scroll (Arriba/Abajo)' },
  { value: 'volume_up', label: 'Subir Volumen' },
  { value: 'volume_down', label: 'Bajar Volumen' },
  { value: 'brightness_up', label: 'Subir Brillo' },
  { value: 'brightness_down', label: 'Bajar Brillo' },
  { value: 'key_space', label: 'Tecla: Espacio' },
  { value: 'key_enter', label: 'Tecla: Enter' },
  { value: 'key_f1', label: 'Tecla: F1' },
  { value: 'key_f2', label: 'Tecla: F2' },
  { value: 'key_f3', label: 'Tecla: F3' },
  { value: 'key_f4', label: 'Tecla: F4' },
  { value: 'key_f5', label: 'Tecla: F5' },
  { value: 'key_f6', label: 'Tecla: F6' },
  { value: 'key_f7', label: 'Tecla: F7' },
  { value: 'key_f8', label: 'Tecla: F8' },
  { value: 'key_f9', label: 'Tecla: F9' },
  { value: 'key_f10', label: 'Tecla: F10' },
  { value: 'key_f11', label: 'Tecla: F11' },
  { value: 'key_f12', label: 'Tecla: F12' }
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2, angle: 0, color: '#3b82f6' });
  const [isLeftClick, setIsLeftClick] = useState(false);
  const [isRightClick, setIsRightClick] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [yOffset, setYOffset] = useState(0);

  // New Creative Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<'classic' | 'dot' | 'crosshair' | 'ring'>('classic');
  const [colorMode, setColorMode] = useState<'custom' | 'dynamic'>('custom');
  const [cursorColor, setCursorColor] = useState('#3b82f6');
  const [enableRotation, setEnableRotation] = useState(true);
  const [angleOffset, setAngleOffset] = useState(0);
  const [sensitivityX, setSensitivityX] = useState(DEFAULT_SCALE_FACTOR);
  const [sensitivityY, setSensitivityY] = useState(DEFAULT_SCALE_FACTOR);
  const [smoothing, setSmoothing] = useState(DEFAULT_SMOOTHING);
  const [gestureMap, setGestureMap] = useState<Record<string, GestureAction>>({
    index: 'click_left',
    middle: 'click_right',
    ring: 'scroll',
    pinky: 'none'
  });
  const [clickImage, setClickImage] = useState<string | null>(null);
  const [clickImageHotspot, setClickImageHotspot] = useState({ x: 50, y: 50 });
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem('wsUrl') || 'ws://localhost:3001');
  const [isPipActive, setIsPipActive] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // Refs for mutable state in the animation loop
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef(-1);
  const smoothedPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const smoothedAngleRef = useRef(0);
  const isLeftClickRef = useRef(false);
  const isRightClickRef = useRef(false);
  const yOffsetRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  const colorModeRef = useRef(colorMode);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedRgbRef = useRef({ r: 59, g: 130, b: 246 });
  const sensitivityXRef = useRef(sensitivityX);
  const sensitivityYRef = useRef(sensitivityY);
  const smoothingRef = useRef(smoothing);
  const gestureMapRef = useRef(gestureMap);
  
  // Custom gesture states
  const activeGesturesRef = useRef<Record<string, boolean>>({
    index: false, middle: false, ring: false, pinky: false
  });
  const isDraggingRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollStartYRef = useRef(0);
  const lastSeenHandTimeRef = useRef(0);
  const lastActionTimeRef = useRef(0);

  useEffect(() => {
    yOffsetRef.current = yOffset;
  }, [yOffset]);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    const connectWS = () => {
      try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log('WebSocket connected to', wsUrl);
        ws.onclose = () => {
          console.log('WebSocket disconnected, reconnecting...');
          reconnectTimeout = setTimeout(connectWS, 3000);
        };
        wsRef.current = ws;
      } catch (e) {
        console.error('Invalid WebSocket URL', e);
      }
    };
    connectWS();
    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [wsUrl]);

  const handleWsUrlChange = (newUrl: string) => {
    setWsUrl(newUrl);
    localStorage.setItem('wsUrl', newUrl);
  };

  useEffect(() => {
    colorModeRef.current = colorMode;
  }, [colorMode]);

  useEffect(() => {
    sensitivityXRef.current = sensitivityX;
  }, [sensitivityX]);

  useEffect(() => {
    sensitivityYRef.current = sensitivityY;
  }, [sensitivityY]);

  useEffect(() => {
    gestureMapRef.current = gestureMap;
  }, [gestureMap]);

  useEffect(() => {
    smoothingRef.current = smoothing;
  }, [smoothing]);

  useEffect(() => {
    // Create a hidden canvas for color sampling
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    colorCanvasRef.current = canvas;
  }, []);

  useEffect(() => {
    let active = true;

    const initializeHandTracking = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        if (!active) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (!active) return;
        handLandmarkerRef.current = handLandmarker;

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' }
        });

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setIsReady(true);
            startDetection();
          };
        }
      } catch (err: any) {
        console.error("Error initializing:", err);
        setError(err.message || "Failed to access camera or load model.");
      }
    };

    initializeHandTracking();

    // Wake Lock to prevent sleep
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock active');
        }
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    };
    requestWakeLock();

    return () => {
      active = false;
      if (requestRef.current) clearTimeout(requestRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (wakeLockRef.current) wakeLockRef.current.release();
    };
  }, []);

  const togglePiP = async () => {
    try {
      if (!videoRef.current) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch (error) {
      console.error('PiP Error:', error);
    }
  };

  const calculateDistance = (p1: { x: number, y: number, z: number }, p2: { x: number, y: number, z: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  };

  const startDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const handLandmarker = handLandmarkerRef.current;

    if (!video || !canvas || !handLandmarker) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const detect = () => {
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        
        // Ensure canvas matches video dimensions
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const now = performance.now();
        const results = handLandmarker.detectForVideo(video, now);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          
          // Draw landmarks for debug
          if (showDebug) {
            ctx.save();
            ctx.scale(-1, 1); // Mirror horizontally
            ctx.translate(-canvas.width, 0);
            
            // Draw connections
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            
            // Simple drawing of key points
            const drawPoint = (idx: number, color: string) => {
              const p = landmarks[idx];
              ctx.beginPath();
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            };

            drawPoint(4, '#FF0000'); // Thumb tip
            drawPoint(8, '#0000FF'); // Index tip
            drawPoint(12, '#FFFF00'); // Middle tip
            drawPoint(0, '#FFFFFF'); // Wrist
            
            ctx.restore();
          }

          // 1. Calculate pointing direction / cursor position
          // Use Middle Finger MCP (9) instead of Index Tip (8) for stable hand tracking
          const trackingPoint = landmarks[9];
          const wrist = landmarks[0];

          const rawX = 1.0 - trackingPoint.x; 
          const rawY = trackingPoint.y;

          // Calculate angle (wrist to middle finger MCP)
          const dx = -(trackingPoint.x - wrist.x); // Mirrored X
          const dy = trackingPoint.y - wrist.y;
          const angleRad = Math.atan2(dy, dx);
          let targetAngle = angleRad * (180 / Math.PI) + 90;

          let currentAngle = smoothedAngleRef.current;
          let diff = targetAngle - currentAngle;
          while (diff < -180) diff += 360;
          while (diff > 180) diff -= 360;
          const s = smoothingRef.current;
          smoothedAngleRef.current = currentAngle + diff * (1 - s);

          // Apply scaling to allow reaching edges without moving hand to the very edge of the camera
          // Center is 0.5, 0.5
          const scaledX = 0.5 + (rawX - 0.5) * sensitivityXRef.current;
          const scaledY = 0.5 + (rawY - 0.5) * sensitivityYRef.current - yOffsetRef.current;

          // Clamp to 0-1
          const clampedX = Math.max(0, Math.min(1, scaledX));
          const clampedY = Math.max(0, Math.min(1, scaledY));

          // Map to screen coordinates
          const targetX = clampedX * window.innerWidth;
          const targetY = clampedY * window.innerHeight;

          // Apply Exponential Moving Average for smoothing
          smoothedPosRef.current.x = smoothedPosRef.current.x * s + targetX * (1 - s);
          smoothedPosRef.current.y = smoothedPosRef.current.y * s + targetY * (1 - s);

          // Extract Color if dynamic
          let currentColor = '#3b82f6'; // fallback
          if (colorModeRef.current === 'dynamic' && colorCanvasRef.current) {
            const colorCtx = colorCanvasRef.current.getContext('2d', { willReadFrequently: true });
            if (colorCtx) {
              // Use un-mirrored X for video sampling
              const vx = trackingPoint.x * video.videoWidth;
              const vy = trackingPoint.y * video.videoHeight;
              const cx = Math.max(0, Math.min(video.videoWidth - 1, vx));
              const cy = Math.max(0, Math.min(video.videoHeight - 1, vy));
              
              colorCtx.drawImage(video, cx, cy, 1, 1, 0, 0, 1, 1);
              const data = colorCtx.getImageData(0, 0, 1, 1).data;
              
              smoothedRgbRef.current.r = smoothedRgbRef.current.r * 0.9 + data[0] * 0.1;
              smoothedRgbRef.current.g = smoothedRgbRef.current.g * 0.9 + data[1] * 0.1;
              smoothedRgbRef.current.b = smoothedRgbRef.current.b * 0.9 + data[2] * 0.1;
              
              currentColor = `rgb(${Math.round(smoothedRgbRef.current.r)}, ${Math.round(smoothedRgbRef.current.g)}, ${Math.round(smoothedRgbRef.current.b)})`;
            }
          }

          setCursorPos({ 
            x: smoothedPosRef.current.x, 
            y: smoothedPosRef.current.y,
            angle: smoothedAngleRef.current,
            color: currentColor
          } as any);

          // Send to Backend
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            // Send normalized coordinates (0 to 1) instead of screen pixels
            // This allows the receiver (Mac) to scale it to its own resolution
            wsRef.current.send(JSON.stringify({ 
              type: 'move', 
              nx: clampedX, 
              ny: clampedY 
            }));
          }

          // 2. Detect Gestures and Actions
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const middleTip = landmarks[12];
          const ringTip = landmarks[16];
          const pinkyTip = landmarks[20];

          // Palm facing check to prevent accidental clicks
          let isPalmFacing = true;
          if (results.handednesses && results.handednesses.length > 0) {
            const handedness = results.handednesses[0][0].categoryName;
            const indexMcp = landmarks[5];
            const pinkyMcp = landmarks[17];
            
            // X goes from 0 (left) to 1 (right) in camera frame
            if (handedness === 'Right') {
              // Right hand (camera perspective): palm faces camera if pinky is to the right of index
              isPalmFacing = pinkyMcp.x > indexMcp.x;
            } else {
              // Left hand: palm faces camera if pinky is to the left of index
              isPalmFacing = pinkyMcp.x < indexMcp.x;
            }
          }

          // Hysteresis: to start a gesture, palm must face and distance < PINCH_THRESHOLD
          // To maintain, distance < PINCH_THRESHOLD * 1.5 (palm facing ignored so turning hand doesn't drop holds)
          const maintainThreshold = PINCH_THRESHOLD * 1.5;
          const currentStates = {
            index: activeGesturesRef.current.index 
              ? calculateDistance(thumbTip, indexTip) < maintainThreshold
              : isPalmFacing && calculateDistance(thumbTip, indexTip) < PINCH_THRESHOLD,
            middle: activeGesturesRef.current.middle 
              ? calculateDistance(thumbTip, middleTip) < maintainThreshold
              : isPalmFacing && calculateDistance(thumbTip, middleTip) < PINCH_THRESHOLD,
            ring: activeGesturesRef.current.ring 
              ? calculateDistance(thumbTip, ringTip) < maintainThreshold
              : isPalmFacing && calculateDistance(thumbTip, ringTip) < PINCH_THRESHOLD,
            pinky: activeGesturesRef.current.pinky 
              ? calculateDistance(thumbTip, pinkyTip) < maintainThreshold
              : isPalmFacing && calculateDistance(thumbTip, pinkyTip) < PINCH_THRESHOLD
          };

          const handleAction = (finger: string, isActive: boolean, wasActive: boolean) => {
            const action = gestureMapRef.current[finger] || 'none';
            if (action === 'none') return;
            
            const now = performance.now();
            const ws = wsRef.current;
            const isOpen = ws?.readyState === WebSocket.OPEN;

            // Left/Right Click & Drag (Continuous hold)
            if (action.startsWith('click_') || action === 'drag') {
              const btn = action.includes('right') ? 'right' : 'left';
              if (isActive && !wasActive) {
                    if (btn === 'left') { isDraggingRef.current = true; setIsLeftClick(true); }
                    else { setIsRightClick(true); }
                    if (isOpen) ws.send(JSON.stringify({ type: 'mouse_down', button: btn }));
              } else if (!isActive && wasActive) {
                    if (btn === 'left') { isDraggingRef.current = false; setIsLeftClick(false); }
                    else { setIsRightClick(false); }
                    if (isOpen) ws.send(JSON.stringify({ type: 'mouse_up', button: btn }));
                  }
                  return;
            }

            // Scroll
            if (action === 'scroll') {
              if (isActive && !wasActive) {
                isScrollingRef.current = true;
                scrollStartYRef.current = smoothedPosRef.current.y;
              } else if (isActive && wasActive) {
                const delta = smoothedPosRef.current.y - scrollStartYRef.current;
                // Scroll multiplier
                if (Math.abs(delta) > 10) {
                  const scrollAmount = delta * 0.5; // adjust multiplier as needed
                  if (isOpen) ws.send(JSON.stringify({ type: 'scroll', delta: scrollAmount }));
                  scrollStartYRef.current = smoothedPosRef.current.y;
                }
              } else if (!isActive && wasActive) {
                isScrollingRef.current = false;
              }
              return;
            }

            // Discrete actions (keys, media)
            if (isActive && !wasActive) {
              if (now - lastActionTimeRef.current < 300) return; // Basic debounce
              
              if (action === 'volume_up' || action === 'volume_down' || action === 'brightness_up' || action === 'brightness_down') {
                const [type, dir] = action.split('_');
                if (isOpen) ws.send(JSON.stringify({ type, direction: dir }));
              }
              else if (action.startsWith('key_') || action.match(/^f(1[0-2]|[1-9])$/i)) {
                const keyName = action.startsWith('key_') ? action.replace('key_', '') : action;
                if (isOpen) {
                  console.log('Sending key gesture:', keyName);
                  ws.send(JSON.stringify({ type: 'key', key: keyName }));
                }
              }
              
              lastActionTimeRef.current = now;
            }
          };

          // Execute action handling for each tracked finger
          for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
            handleAction(finger, currentStates[finger], activeGesturesRef.current[finger]);
            activeGesturesRef.current[finger] = currentStates[finger];
          }

        } else {
          // No hand detected - release locks but with a debounce for dropped frames
          if (now - lastSeenHandTimeRef.current > 300) {
            if (isDraggingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'mouse_up', button: 'left' }));
            }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              // Failsafe release for right click if hand is lost while holding
              wsRef.current.send(JSON.stringify({ type: 'mouse_up', button: 'right' }));
            }
            setIsLeftClick(false);
            setIsRightClick(false);
            isDraggingRef.current = false;
            isScrollingRef.current = false;
            activeGesturesRef.current = { index: false, middle: false, ring: false, pinky: false };
          }
        }
      }
      // Use setTimeout instead of requestAnimationFrame so it keeps running in the background
      requestRef.current = setTimeout(detect, 1000 / 30) as unknown as number;
    };

    detect();
  };

  const simulateClick = (type: 'left' | 'right', x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'click', button: type }));
    }

    // Temporarily hide our virtual cursor so document.elementFromPoint doesn't just find the cursor itself
    const cursorEl = document.getElementById('virtual-cursor');
    if (cursorEl) cursorEl.style.pointerEvents = 'none';

    const element = document.elementFromPoint(x, y);
    
    if (element) {
      // Create and dispatch the event
      const eventType = type === 'left' ? 'click' : 'contextmenu';
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: type === 'left' ? 0 : 2
      });
      element.dispatchEvent(event);
      
      // Visual feedback on the element (optional)
      if (type === 'left') {
        element.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50', 'transition-all');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50', 'transition-all');
        }, 200);
      }
    }

    if (cursorEl) cursorEl.style.pointerEvents = 'none'; // Keep it none
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setClickImage(event.target?.result as string);
        setClickImageHotspot({ x: 50, y: 50 }); // reset to center
      };
      reader.readAsDataURL(file);
    }
  };

  const handleHotspotClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClickImageHotspot({ x, y });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 overflow-hidden relative font-sans">
      {/* Hidden Video Element */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
      />

      {/* Main UI */}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
        {/* Header */}
        <header className="p-6 flex justify-between items-start">
          <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 shadow-xl pointer-events-auto">
            <h1 className="text-xl font-semibold flex items-center gap-2 mb-2">
              <MousePointer2 className="w-5 h-5 text-blue-400" />
              Hand Tracking Cursor
            </h1>
            <p className="text-sm text-slate-400 max-w-xs">
              Mueve tu mano para controlar el cursor. Junta el pulgar y el índice para click izquierdo. Junta el pulgar y el medio para click derecho.
            </p>
            
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs">
                <div className={`w-3 h-3 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                {isReady ? 'Cámara activa y modelo cargado' : 'Inicializando...'}
              </div>
              {error && (
                <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-3 rounded-xl border bg-slate-800/80 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
              title="Ajustes del Cursor"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className={`p-3 rounded-xl border transition-colors ${showDebug ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-slate-800/80 border-slate-700/50 text-slate-400 hover:bg-slate-700'}`}
              title="Toggle Debug View"
            >
              <Camera className="w-5 h-5" />
            </button>
            <button 
              onClick={togglePiP}
              className={`p-3 rounded-xl border transition-colors ${isPipActive ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-800/80 border-slate-700/50 text-slate-400 hover:bg-slate-700'}`}
              title="Activar Modo Fondo (Picture-in-Picture)"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Vertical Adjuster */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 shadow-xl pointer-events-auto flex flex-col items-center gap-6 z-20">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap -rotate-90 mb-4">Altura</span>
          <div className="h-32 flex items-center justify-center">
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={yOffset}
              onChange={(e) => setYOffset(parseFloat(e.target.value))}
              className="w-32 h-2 origin-center -rotate-90 appearance-none bg-slate-700 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
            />
          </div>
          <span className="text-xs text-slate-400 font-mono mt-4">
            {yOffset > 0 ? '+' : ''}{Math.round(yOffset * 100)}
          </span>
        </div>

        {/* Interactive Test Area */}
        <main className="flex-1 flex items-center justify-center p-8 pointer-events-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <button
                key={i}
                onClick={() => console.log(`Left clicked button ${i}`)}
                onContextMenu={(e) => { e.preventDefault(); console.log(`Right clicked button ${i}`); }}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-8 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all hover:scale-105 hover:shadow-xl group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-700 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
                  <span className="text-xl font-bold text-slate-400 group-hover:text-blue-400">{i}</span>
                </div>
                <span className="text-sm font-medium text-slate-300">Interactúa aquí</span>
              </button>
            ))}
          </div>
        </main>
      </div>

      {/* Debug Canvas (Camera Feed + Landmarks) */}
      <div className={`absolute bottom-6 right-6 w-64 aspect-video bg-black rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl transition-opacity duration-300 ${showDebug ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* We draw the video frame manually to the canvas if we want, or just overlay canvas on video.
            Since video is hidden, let's draw video to canvas in the loop if we want to see it, 
            but MediaPipe's detectForVideo doesn't automatically draw the video.
            Let's add a video element specifically for the debug view. */}
        <video
          ref={(el) => {
            if (el && videoRef.current && el.srcObject !== videoRef.current.srcObject) {
              el.srcObject = videoRef.current.srcObject;
              el.play().catch(()=>console.log("Play interrupted"));
            }
          }}
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover z-10"
        />
      </div>

      {/* Settings Panel Overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-slate-800 pb-2 z-10 border-b border-slate-700/50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white"><Settings2 className="w-5 h-5"/> Ajustes del Cursor</h2>
              <button onClick={() => setSettingsOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-6">
              {/* Connection */}
              <div>
                <h3 className="text-sm font-medium text-white mb-3">Conexión Backend</h3>
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-2">URL del WebSocket</label>
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => handleWsUrlChange(e.target.value)}
                    placeholder="ws://localhost:3001 o ws://IP:3001"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Usa ws://localhost:3001 si usas la web en este mismo dispositivo. 
                    Si la conectas desde otro (móvil, tablet u otra PC), ingresa la IP local de tu Mac (ej. ws://192.168.1.100:3001).
                  </p>
                </div>
              </div>

              {/* Movement & Sensitivity */}
              <div className="pt-4 border-t border-slate-700/50">
                <h3 className="text-sm font-medium text-white mb-3">Movimiento</h3>
                
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Sensibilidad X (Horizontal)</span>
                    <span className="font-mono">{sensitivityX.toFixed(1)}x</span>
                  </div>
                  <input type="range" min="0.5" max="3.0" step="0.1" value={sensitivityX} onChange={e => setSensitivityX(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full" />
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Sensibilidad Y (Vertical)</span>
                    <span className="font-mono">{sensitivityY.toFixed(1)}x</span>
                  </div>
                  <input type="range" min="0.5" max="3.0" step="0.1" value={sensitivityY} onChange={e => setSensitivityY(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full" />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Suavizado (Estabilidad vs Velocidad)</span>
                    <span className="font-mono">{Math.round(smoothing * 100)}%</span>
                  </div>
                  <input type="range" min="0.1" max="0.95" step="0.05" value={smoothing} onChange={e => setSmoothing(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full" />
                </div>
              </div>

              {/* Style */}
              <div className="pt-4 border-t border-slate-700/50">
                <h3 className="text-sm font-medium text-white mb-3">Apariencia</h3>
                <label className="block text-sm font-medium text-slate-400 mb-1">Estilo del Cursor</label>
                <select value={cursorStyle} onChange={e => setCursorStyle(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 transition-colors mb-4">
                  <option value="classic">Clásico (Flecha)</option>
                  <option value="dot">Punto Minimalista</option>
                  <option value="crosshair">Mira (Crosshair)</option>
                  <option value="ring">Anillo (Target)</option>
                </select>

                <label className="block text-sm font-medium text-slate-400 mb-1">Color del Cursor</label>
                <div className="flex gap-3">
                  <select value={colorMode} onChange={e => setColorMode(e.target.value as any)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 transition-colors">
                    <option value="custom">Color Fijo</option>
                    <option value="dynamic">Dinámico (Camaleón)</option>
                  </select>
                  {colorMode === 'custom' && (
                    <input type="color" value={cursorColor} onChange={e => setCursorColor(e.target.value)} className="w-12 h-11 rounded-lg cursor-pointer bg-slate-900 border border-slate-700 p-1" />
                  )}
                </div>
                {colorMode === 'dynamic' && <p className="text-xs text-slate-500 mt-1">El color se adapta a lo que la cámara ve detrás de tu mano.</p>}
              </div>

              {/* Advanced Gestures */}
              <div className="pt-4 border-t border-slate-700/50">
                <h3 className="text-sm font-medium text-white mb-3">Gestos Personalizados</h3>
                <p className="text-xs text-slate-400 mb-4">Configura qué acción hace cada dedo al juntarse con tu pulgar.</p>
                
                <div className="space-y-3">
                  {['index', 'middle', 'ring', 'pinky'].map((finger, idx) => {
                    const fingerLabels = ['Índice', 'Medio', 'Anular', 'Meñique'];
                    return (
                      <div key={finger} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-300">Pulgar + {fingerLabels[idx]}</label>
                        <select 
                          value={gestureMap[finger]} 
                          onChange={e => setGestureMap({...gestureMap, [finger]: e.target.value as GestureAction})} 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                        >
                          {GESTURE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Click Image */}
              <div className="pt-4 border-t border-slate-700/50">
                <h3 className="text-sm font-medium text-white mb-3">Efecto de Click (PNG/GIF)</h3>
                
                <input 
                  type="file" 
                  accept="image/png, image/gif" 
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30 mb-3 cursor-pointer"
                />

                {clickImage && (
                  <div className="space-y-3 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                    <p className="text-xs text-slate-400">Haz click en la imagen para establecer el centro del cursor (punto de anclaje):</p>
                    <div className="flex justify-center">
                      <div 
                        className="relative inline-block border border-slate-600 rounded bg-slate-800 cursor-crosshair overflow-hidden"
                        onClick={handleHotspotClick}
                      >
                        <img src={clickImage} alt="Preview" className="max-w-[200px] max-h-[150px] object-contain pointer-events-none" />
                        <div 
                          className="absolute w-4 h-4 border-2 border-red-500 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.5)] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                          style={{ left: `${clickImageHotspot.x}%`, top: `${clickImageHotspot.y}%` }}
                        >
                          <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setClickImage(null)}
                      className="w-full py-2 text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors"
                    >
                      Quitar imagen
                    </button>
                  </div>
                )}
              </div>

              {/* Rotation */}
              <div className="pt-4 border-t border-slate-700/50">
                <label className="flex items-center gap-3 text-sm font-medium text-white mb-3 cursor-pointer">
                  <input type="checkbox" checked={enableRotation} onChange={e => setEnableRotation(e.target.checked)} className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800" />
                  Rotar con el ángulo de la mano
                </label>
                {enableRotation && (
                  <div className="pl-7">
                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                      <span>Ajuste de Ángulo</span>
                      <span className="font-mono">{angleOffset}°</span>
                    </div>
                    <input type="range" min="-180" max="180" value={angleOffset} onChange={e => setAngleOffset(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Virtual Cursor */}
      {isReady && (() => {
        const activeColor = colorMode === 'dynamic' ? cursorPos.color : cursorColor;
        const rotation = enableRotation ? cursorPos.angle + angleOffset : 0;
        const isCentered = cursorStyle !== 'classic';
        const scaleClass = (isLeftClick || isRightClick) ? "scale-75" : "scale-100";
        const baseClasses = "transition-all duration-150 drop-shadow-lg";
        
        // Right click gets a distinct visual cue (e.g., amber border/glow)
        const rightClickStyle = isRightClick ? { filter: 'drop-shadow(0 0 8px #f59e0b)' } : {};

        return (
          <div
            id="virtual-cursor"
            className="fixed top-0 left-0 z-[60] pointer-events-none transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${cursorPos.x}px, ${cursorPos.y}px) rotate(${rotation}deg)`,
            }}
          >
            {/* Custom Click Image */}
            {clickImage && (isLeftClick || isRightClick) && (
              <img 
                src={clickImage} 
                alt="Click Effect" 
                className="absolute pointer-events-none z-10 drop-shadow-xl"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate(-${clickImageHotspot.x}%, -${clickImageHotspot.y}%)`,
                  maxWidth: '150px',
                  maxHeight: '150px'
                }}
              />
            )}

            <div className="relative" style={{ transform: isCentered ? 'translate(-50%, -50%)' : 'none' }}>
              
              {/* Cursor Visuals based on style */}
              {cursorStyle === 'classic' && (
                <MousePointer2 
                  className={`w-8 h-8 ${baseClasses} ${scaleClass}`} 
                  style={{ 
                    color: isRightClick ? '#f59e0b' : activeColor, 
                    fill: isLeftClick ? activeColor : isRightClick ? '#f59e0b' : 'rgba(255,255,255,0.8)',
                    transformOrigin: '0 0',
                    ...rightClickStyle
                  }}
                />
              )}
              
              {cursorStyle === 'dot' && (
                <div 
                  className={`w-6 h-6 rounded-full border-2 ${baseClasses} ${scaleClass}`}
                  style={{ 
                    backgroundColor: isLeftClick ? activeColor : isRightClick ? '#f59e0b' : 'rgba(255,255,255,0.3)', 
                    borderColor: isRightClick ? '#f59e0b' : activeColor,
                    ...rightClickStyle
                  }} 
                />
              )}

              {cursorStyle === 'crosshair' && (
                <Crosshair 
                  className={`w-8 h-8 ${baseClasses} ${scaleClass}`}
                  style={{ color: isRightClick ? '#f59e0b' : activeColor, ...rightClickStyle }}
                />
              )}

              {cursorStyle === 'ring' && (
                <Target 
                  className={`w-8 h-8 ${baseClasses} ${scaleClass}`}
                  style={{ color: isRightClick ? '#f59e0b' : activeColor, ...rightClickStyle }}
                />
              )}
              
              {/* Default Click Ripple Effect (only if no custom image) */}
              {!clickImage && (isLeftClick || isRightClick) && (
                <div 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full animate-ping opacity-75"
                  style={{ backgroundColor: isRightClick ? '#f59e0b' : activeColor }}
                />
              )}

              {/* Tooltip indicating state */}
              <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ transform: `translateX(-50%) rotate(${-rotation}deg)` }}>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-900/80 text-white backdrop-blur-md transition-opacity duration-150 ${
                  (isLeftClick || isRightClick) ? 'opacity-100' : 'opacity-0'
                }`}>
                  {isLeftClick ? 'Left Click' : isRightClick ? 'Right Click' : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
