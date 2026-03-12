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

type GestureAction = 'none' | 'click_left' | 'click_right' | 'drag' | 'scroll' | 'volume_up' | 'volume_down' | 'brightness_up' | 'brightness_down' | 'key_space' | 'key_enter' | 'key_escape' | 'key_backspace' | 'key_tab' | 'hotkey_copy' | 'hotkey_paste' | 'hotkey_undo' | 'key_f1' | 'key_f2' | 'key_f3' | 'key_f4' | 'key_f5' | 'key_f6' | 'key_f7' | 'key_f8' | 'key_f9' | 'key_f10' | 'key_f11' | 'key_f12';
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
  { value: 'key_escape', label: 'Tecla: Escape' },
  { value: 'key_backspace', label: 'Tecla: Borrar' },
  { value: 'key_tab', label: 'Tecla: Tab' },
  { value: 'hotkey_copy', label: 'Ctrl/Cmd + C' },
  { value: 'hotkey_paste', label: 'Ctrl/Cmd + V' },
  { value: 'hotkey_undo', label: 'Ctrl/Cmd + Z' },
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
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('onboardingCompleted'));


  // New Creative Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<'classic' | 'dot' | 'crosshair' | 'ring'>('classic');
  const [colorMode, setColorMode] = useState<'custom' | 'dynamic'>('custom');
  const [cursorColor, setCursorColor] = useState('#3b82f6');
  // Sensibilidad Dual
  const [posSensitivityX, setPosSensitivityX] = useState(DEFAULT_SCALE_FACTOR);
  const [posSensitivityY, setPosSensitivityY] = useState(DEFAULT_SCALE_FACTOR);
  const [rotSensitivityX, setRotSensitivityX] = useState(1.0);
  const [rotSensitivityY, setRotSensitivityY] = useState(1.0);
  const [smoothing, setSmoothing] = useState(DEFAULT_SMOOTHING);
  const [gestureMap, setGestureMap] = useState<Record<string, GestureAction>>({
    index: 'click_left',
    middle: 'click_right',
    ring: 'scroll',
    pinky: 'none'
  });
  // Se mantienen para retrocompatibilidad pero se esconden o ignoran en la lógica de trabas
  const [angleControlEnabled, setAngleControlEnabled] = useState(false);
  const [angleSensitivity, setAngleSensitivity] = useState(1.5);
  const [activationThreshold, setActivationThreshold] = useState(45);
  const [clickImage, setClickImage] = useState<string | null>(null);
  const [clickImageHotspot, setClickImageHotspot] = useState({ x: 50, y: 50 });
  const [wsUrl, setWsUrl] = useState(() => {
    // 1. Check URL parameters (Highest priority for automation)
    const params = new URLSearchParams(window.location.search);
    const wsParam = params.get('ws');
    if (wsParam) return wsParam;
    
    // 2. Fallback to localStorage
    return localStorage.getItem('wsUrl') || 'ws://localhost:3001';
  });

  const [antiMistouch, setAntiMistouch] = useState(() => {
    return localStorage.getItem('antiMistouchEnabled') !== 'false'; // Predeterminado true
  });
  
  const [isPipActive, setIsPipActive] = useState(false);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const wakeLockRef = useRef<any>(null);

  // Auto-connect if URL parameter changes or is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wsParam = params.get('ws');
    if (wsParam && wsParam !== wsUrl) {
      setWsUrl(wsParam);
      localStorage.setItem('wsUrl', wsParam);
    }
  }, []);

  // Refs for mutable state in the animation loop
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef(-1);
  const smoothedPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const smoothedNormPosRef = useRef({ x: 0.5, y: 0.5 });
  const rotationGimbalRef = useRef({ pitch: 0, yaw: 0 }); // Filtro independiente anti-temblor para la rotación 3D
  const smoothedAngleRef = useRef(0);
  const isLeftClickRef = useRef(false);
  const isRightClickRef = useRef(false);
  const yOffsetRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const colorModeRef = useRef(colorMode);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedRgbRef = useRef({ r: 59, g: 130, b: 246 });
  const posSensitivityXRef = useRef(posSensitivityX);
  const posSensitivityYRef = useRef(posSensitivityY);
  const rotSensitivityXRef = useRef(rotSensitivityX);
  const rotSensitivityYRef = useRef(rotSensitivityY);
  const smoothingRef = useRef(smoothing);
  const gestureMapRef = useRef(gestureMap);
  const angleControlRef = useRef(angleControlEnabled);
  const angleSensitivityRef = useRef(angleSensitivity);
  const activationThresholdRef = useRef(activationThreshold);
  
  // Custom gesture states
  const activeGesturesRef = useRef<Record<string, boolean>>({
    index: false, middle: false, ring: false, pinky: false
  });
  const antiMistouchRef = useRef(antiMistouch);
  const isHandExtremeAngleRef = useRef(false);
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
        setWsStatus('connecting');
        ws.onopen = () => {
          console.log('WebSocket connected to', wsUrl);
          setWsStatus('connected');
        };
        ws.onclose = () => {
          console.log('WebSocket disconnected, reconnecting...');
          setWsStatus('disconnected');
          reconnectTimeout = setTimeout(connectWS, 3000);
        };
        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          setWsStatus('error');
        };
        wsRef.current = ws;
      } catch (e) {
        console.error('Invalid WebSocket URL', e);
        setWsStatus('error');
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
    if (wsRef.current && wsUrl.includes(':3001')) { // Basic check for active custom URL
      const checkConnection = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const params = new URLSearchParams(window.location.search);
          if (params.get('ws')) {
            console.log('Auto-connected via URL parameter, closing onboarding...');
            closeOnboarding();
          }
          clearInterval(checkConnection);
        }
      }, 1000);
      return () => clearInterval(checkConnection);
    }
  }, [wsUrl]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('onboardingCompleted', 'true');
  };

  useEffect(() => {
    colorModeRef.current = colorMode;
  }, [colorMode]);

  useEffect(() => { posSensitivityXRef.current = posSensitivityX; }, [posSensitivityX]);
  useEffect(() => { posSensitivityYRef.current = posSensitivityY; }, [posSensitivityY]);
  useEffect(() => { rotSensitivityXRef.current = rotSensitivityX; }, [rotSensitivityX]);
  useEffect(() => { rotSensitivityYRef.current = rotSensitivityY; }, [rotSensitivityY]);
  useEffect(() => { gestureMapRef.current = gestureMap; }, [gestureMap]);
  useEffect(() => { smoothingRef.current = smoothing; }, [smoothing]);
  useEffect(() => { angleControlRef.current = angleControlEnabled; }, [angleControlEnabled]);
  useEffect(() => { angleSensitivityRef.current = angleSensitivity; }, [angleSensitivity]);
  useEffect(() => { activationThresholdRef.current = activationThreshold; }, [activationThreshold]);
  useEffect(() => { 
    antiMistouchRef.current = antiMistouch; 
    localStorage.setItem('antiMistouchEnabled', antiMistouch.toString());
  }, [antiMistouch]);

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
            // Trigger audio on first user interaction or here if allowed
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

    // Background Audio Metronome Trick
    const setupBackgroundAudio = () => {
      const audio = new Audio();
      // 1 second of base64 silence
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAgA";
      audio.loop = true;
      audioRef.current = audio;
    };
    setupBackgroundAudio();

    // Web Worker Metronome (Doesn't get throttled as much as the main thread)
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => self.postMessage('tick'), 33);
        } else if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;

    return () => {
      active = false;
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
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

  const calculateDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
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
          const trackingPoint = landmarks[9];
          const wrist = landmarks[0];
          
          let rawNormX = 0;
          let rawNormY = 0;
          const s = smoothingRef.current;

          // Angle calculation for cursor rotation visual
          const dx = -(trackingPoint.x - wrist.x); // Mirrored X
          const dy = trackingPoint.y - wrist.y;
          const angleRad = Math.atan2(dy, dx);
          let targetAngleValue = angleRad * (180 / Math.PI) + 90;

          let currentAngle = smoothedAngleRef.current;
          let angleDiff = targetAngleValue - currentAngle;
          while (angleDiff < -180) angleDiff += 360;
          while (angleDiff > 180) angleDiff -= 360;
          smoothedAngleRef.current = currentAngle + angleDiff * (1 - s);

          // --- SEGUIMIENTO TOTALMENTE FLUIDO (Sin comportamientos de bloqueo/congelamiento) ---
          
          // 1. Calcular posición base central mapeada a los límites de pantalla
          // La cámara está en modo espejo. trackingPoint.x va de 0 (izquierda de la imagen = tu derecha) a 1 (derecha de la imagen = tu izquierda).
          // Para que moverse físicamente a la derecha mueva el cursor a la derecha de la pantalla (0 a 1), debemos invertir x.
          const invertedX = 1.0 - trackingPoint.x;
          let baseNormX = 0.5 + (invertedX - 0.5) * posSensitivityXRef.current;
          let baseNormY = 0.5 + (trackingPoint.y - 0.5) * posSensitivityYRef.current - yOffsetRef.current;

          // 2. Modelo 3D Físico (worldLandmarks - Inmune a perspectiva y distorsión)
          if (results.worldLandmarks && results.worldLandmarks.length > 0) {
            const world = results.worldLandmarks[0];
            const wrist3D = world[0];
            const indexMcp3D = world[5];
            const middleMcp3D = world[9];
            const pinkyMcp3D = world[17];
            
            // Centro de gravedad superior asumiendo la línea de nudillos
            const palmTopX = (indexMcp3D.x + pinkyMcp3D.x + middleMcp3D.x) / 3;
            const palmTopY = (indexMcp3D.y + pinkyMcp3D.y + middleMcp3D.y) / 3;

            // Yaw (Guiñada 3D): Rotación real en el espacio físico
            // Al rotar la mano hacia la derecha (físicamente), el nudillo va hacia la derecha.
            // En worldLandmarks (centrado en la lente con espejo invertido), 'X' es negativo a tu derecha.
            // Para que empuje el cursor a *tu derecha* de la pantalla (positivo), sumamos inversamente:
            const rawYaw = wrist3D.x - palmTopX;
            
            // Pitch (Cabeceo 3D): Inclinación real en el espacio físico
            // POSTURA_RELAJADA_Y compensa que la mano naturalmente tiene un ángulo hacia la cámara en worldLandmarks
            const POSTURA_RELAJADA_Y = -0.06; // Compensador anatómico (Ajustable si sigue yéndose muy arriba/abajo)
            const rawPitch = (palmTopY - wrist3D.y) - POSTURA_RELAJADA_Y;

            // --- FILTRO GIMBAL (Suavizado independiente y extremo para eliminar el temblor angular) ---
            // Un smoothing altísimo asegura que la rotación se sienta como fluida ("cinemática")
            const gimbalSmoothing = 0.85 + (smoothingRef.current * 0.1); 
            rotationGimbalRef.current.yaw = (rotationGimbalRef.current.yaw * gimbalSmoothing) + (rawYaw * (1 - gimbalSmoothing));
            rotationGimbalRef.current.pitch = (rotationGimbalRef.current.pitch * gimbalSmoothing) + (rawPitch * (1 - gimbalSmoothing));

            // Inyección inteligente: Aspect Ratio (Y/X asimétricos)
            // MAGIC_YAW/MAGIC_PITCH compensan el hecho de que worldLandmarks está en escala de metros
            const MAGIC_YAW = 18.0;   // Más sensible para cubrir pantallas anchas
            const MAGIC_PITCH = 12.0; // Menos fuerza al Pitch para no irse rápido a los techos 16:9
            
            rawNormX = baseNormX + (rotationGimbalRef.current.yaw * rotSensitivityXRef.current * MAGIC_YAW);
            rawNormY = baseNormY + (rotationGimbalRef.current.pitch * rotSensitivityYRef.current * MAGIC_PITCH);
          } else {
            rawNormX = baseNormX;
            rawNormY = baseNormY;
          }

          // Clamp to normalized boundaries
          const clampedX = Math.max(0, Math.min(1, rawNormX));
          const clampedY = Math.max(0, Math.min(1, rawNormY));

          // Apply EMA Smoothing on Normalized Values (Fixes "smoothing only on page")
          smoothedNormPosRef.current.x = (smoothedNormPosRef.current.x * s) + (clampedX * (1 - s));
          smoothedNormPosRef.current.y = (smoothedNormPosRef.current.y * s) + (clampedY * (1 - s));

          // Map to local screen pixels for UI
          const uiX = smoothedNormPosRef.current.x * window.innerWidth;
          const uiY = smoothedNormPosRef.current.y * window.innerHeight;
          smoothedPosRef.current = { x: uiX, y: uiY };

          // Extract Color if dynamic
          let currentColor = '#3b82f6';
          if (colorModeRef.current === 'dynamic' && colorCanvasRef.current) {
            const colorCtx = colorCanvasRef.current.getContext('2d', { willReadFrequently: true });
            if (colorCtx) {
              const vx = trackingPoint.x * video.videoWidth;
              const vy = trackingPoint.y * video.videoHeight;
              colorCtx.drawImage(video, Math.max(0, Math.min(video.videoWidth-1, vx)), Math.max(0, Math.min(video.videoHeight-1, vy)), 1, 1, 0, 0, 1, 1);
              const data = colorCtx.getImageData(0, 0, 1, 1).data;
              smoothedRgbRef.current.r = smoothedRgbRef.current.r * 0.9 + data[0] * 0.1;
              smoothedRgbRef.current.g = smoothedRgbRef.current.g * 0.9 + data[1] * 0.1;
              smoothedRgbRef.current.b = smoothedRgbRef.current.b * 0.9 + data[2] * 0.1;
              currentColor = `rgb(${Math.round(smoothedRgbRef.current.r)}, ${Math.round(smoothedRgbRef.current.g)}, ${Math.round(smoothedRgbRef.current.b)})`;
            }
          }

          setCursorPos({ 
            x: uiX, 
            y: uiY,
            angle: smoothedAngleRef.current,
            color: currentColor
          } as any);

          // Send to Backend (Using SMOOTHED coordinates)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ 
              type: 'move', 
              nx: smoothedNormPosRef.current.x, 
              ny: smoothedNormPosRef.current.y 
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

          // --- Anti-Mistouch Protection ---
          let isHandFacingOut = false;
          if (antiMistouchRef.current) {
            // Umbrales donde la mano apunta fuera de un ángulo de interacción útil
            // Pitch > 0.40 suele ser mano muy acostada o apuntando al techo
            // Yaw > 0.45 es mano de perfil extremo
            const isPitchExtreme = Math.abs(rotationGimbalRef.current.pitch) > 0.40;
            const isYawExtreme = Math.abs(rotationGimbalRef.current.yaw) > 0.45;
            isHandFacingOut = isPitchExtreme || isYawExtreme;
          }
          isHandExtremeAngleRef.current = isHandFacingOut;

          // Hysteresis: to start a gesture, palm must face and distance < PINCH_THRESHOLD
          // If Anti-Mistouch is active and hand is facing out, we block starting ANY gesture
          const canStartGesture = !isHandFacingOut && isPalmFacing;

          const maintainThreshold = PINCH_THRESHOLD * 1.5;
          const currentStates = {
            index: activeGesturesRef.current.index 
              ? calculateDistance(thumbTip, indexTip) < maintainThreshold
              : canStartGesture && calculateDistance(thumbTip, indexTip) < PINCH_THRESHOLD,
            middle: activeGesturesRef.current.middle 
              ? calculateDistance(thumbTip, middleTip) < maintainThreshold
              : canStartGesture && calculateDistance(thumbTip, middleTip) < PINCH_THRESHOLD,
            ring: activeGesturesRef.current.ring 
              ? calculateDistance(thumbTip, ringTip) < maintainThreshold
              : canStartGesture && calculateDistance(thumbTip, ringTip) < PINCH_THRESHOLD,
            pinky: activeGesturesRef.current.pinky 
              ? calculateDistance(thumbTip, pinkyTip) < maintainThreshold
              : canStartGesture && calculateDistance(thumbTip, pinkyTip) < PINCH_THRESHOLD
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
              else if (action.startsWith('hotkey_')) {
                const combo = action.replace('hotkey_', '');
                let keys: string[] = [];
                if (combo === 'copy') keys = ['cmd', 'c'];
                if (combo === 'paste') keys = ['cmd', 'v'];
                if (combo === 'undo') keys = ['cmd', 'z'];
                
                if (isOpen) ws.send(JSON.stringify({ type: 'hotkey', keys }));
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
      // Use Web Worker metronome for robust background execution
      if (workerRef.current) {
        workerRef.current.onmessage = (e) => {
          if (e.data === 'tick') detect();
        };
        workerRef.current.postMessage('start');
      }
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
    <div className="min-h-screen text-slate-100 overflow-hidden relative font-sans"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a0f1e 0%, #050810 40%, #000308 100%)' }}>

      {/* Ambient Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #00f5d4 0%, transparent 70%)', filter: 'blur(80px)', animation: 'pulse 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)', filter: 'blur(100px)', animation: 'pulse 10s ease-in-out infinite 2s' }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-6"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)', filter: 'blur(60px)', animation: 'pulse 6s ease-in-out infinite 4s' }} />
      </div>

      {/* CSS Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { font-family: 'Inter', sans-serif; }
        code, input[type="text"].font-mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.08; }
          50% { transform: scale(1.15); opacity: 0.14; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 15px rgba(0,245,212,0.3), 0 0 30px rgba(0,245,212,0.1); }
          50% { box-shadow: 0 0 25px rgba(0,245,212,0.5), 0 0 50px rgba(0,245,212,0.2); }
        }
        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ripple {
          0% { transform: translate(-50%,-50%) scale(0); opacity: 0.8; }
          100% { transform: translate(-50%,-50%) scale(3); opacity: 0; }
        }

        .glass-panel {
          background: rgba(8, 14, 30, 0.75);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(0,245,212,0.15);
          box-shadow: 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .glass-panel-strong {
          background: rgba(5, 10, 22, 0.9);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(0,245,212,0.2);
          box-shadow: 0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(0,245,212,0.03);
        }
        .neon-border {
          border: 1px solid rgba(0,245,212,0.3);
          box-shadow: 0 0 10px rgba(0,245,212,0.1), inset 0 0 10px rgba(0,245,212,0.03);
        }
        .neon-btn {
          background: rgba(0,245,212,0.07);
          border: 1px solid rgba(0,245,212,0.25);
          color: #00f5d4;
          transition: all 0.2s ease;
        }
        .neon-btn:hover {
          background: rgba(0,245,212,0.15);
          box-shadow: 0 0 20px rgba(0,245,212,0.2);
          color: #fff;
        }
        .neon-btn.active {
          background: rgba(0,245,212,0.2);
          box-shadow: 0 0 25px rgba(0,245,212,0.3);
          color: #00f5d4;
        }
        .slider-neon::-webkit-slider-thumb {
          appearance: none; width: 16px; height: 16px;
          border-radius: 50%; background: #00f5d4;
          box-shadow: 0 0 10px rgba(0,245,212,0.6);
          cursor: pointer;
        }
        .slider-purple::-webkit-slider-thumb {
          appearance: none; width: 16px; height: 16px;
          border-radius: 50%; background: #a855f7;
          box-shadow: 0 0 10px rgba(168,85,247,0.6);
          cursor: pointer;
        }
        .slider-base {
          -webkit-appearance: none;
          width: 100%; height: 4px;
          border-radius: 4px;
          background: rgba(255,255,255,0.07);
          outline: none;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,245,212,0.3); border-radius: 4px; }
        .scan-overlay {
          background: linear-gradient(transparent 0%, rgba(0,245,212,0.02) 50%, transparent 100%);
          background-size: 100% 4px;
        }
        .text-neon { color: #00f5d4; }
        .text-neon-dim { color: rgba(0,245,212,0.6); }
        .status-dot-connected { background: #00f5d4; box-shadow: 0 0 8px #00f5d4, 0 0 16px rgba(0,245,212,0.4); }
        .status-dot-connecting { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .status-dot-error { background: #f43f5e; box-shadow: 0 0 8px #f43f5e; }
        .status-dot-disconnected { background: rgba(255,255,255,0.2); }
        select option { background: #0a0f1e; color: #e2e8f0; }
      `}</style>

      {/* Hidden Video Element */}
      <video ref={videoRef} className="hidden" playsInline />
      <canvas ref={colorCanvasRef} className="hidden" width={1} height={1} />

      {/* Main UI Layer (Centered Dashboard) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-4 sm:p-8">
        
        {/* HUD Central Dashboard */}
        <div className="glass-panel-strong rounded-[2rem] p-6 sm:p-8 w-full max-w-5xl flex flex-col gap-6 pointer-events-auto border border-[rgba(0,245,212,0.2)] shadow-[0_0_80px_rgba(0,245,212,0.05)] relative overflow-hidden" 
             style={{ animation: 'fadeInUp 0.5s ease', backdropFilter: 'blur(40px)' }}>

          {/* Subtle Grid Background for Dashboard */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20" 
               style={{ backgroundImage: 'radial-gradient(rgba(0,245,212,0.2) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

          {/* Top Bar: Brand, Status, Actions */}
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-[rgba(0,245,212,0.1)] gap-4">
            
            {/* Logo & Info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #00f5d4 0%, #0ea5e9 100%)', boxShadow: '0 0 30px rgba(0,245,212,0.3)', animation: 'float 4s ease-in-out infinite' }}>
                <MousePointer2 className="w-7 h-7 text-black" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-2xl font-bold tracking-[0.2em] uppercase text-neon" style={{ textShadow: '0 0 10px rgba(0,245,212,0.3)' }}>Neural Cursor</h1>
                <p className="text-[10px] text-slate-400 tracking-[0.3em] uppercase mt-1">Advanced Hand Tracking v2.0</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Status indicators */}
              <div className="flex flex-col items-end gap-2 pr-6 border-r border-[rgba(255,255,255,0.05)] hidden md:flex">
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${wsStatus === 'connected' ? 'status-dot-connected' : 'status-dot-error'}`} />
                   <span className="text-[10px] uppercase tracking-[0.15em] font-mono text-slate-400 max-w-[90px] text-right">
                      {wsStatus === 'connected' ? 'PC SYNC: OK' : 'NO SYNC'}
                   </span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isReady ? 'status-dot-connected' : 'status-dot-connecting animate-pulse'}`} />
                   <span className="text-[10px] uppercase tracking-[0.15em] font-mono font-bold max-w-[90px] text-right" style={{ color: isReady ? '#00f5d4' : '#f59e0b', textShadow: isReady ? '0 0 10px rgba(0,245,212,0.5)' : 'none' }}>
                      {isReady ? 'AI: ACTIVE' : 'CALIBRATING'}
                   </span>
                 </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button id="btn-settings" onClick={() => setSettingsOpen(true)} className="neon-btn p-3 sm:px-4 sm:py-3 rounded-xl flex items-center gap-2" title="Ajustes del Sistema">
                  <Settings2 className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Ajustes</span>
                </button>
                <button id="btn-guide" onClick={() => setShowOnboarding(true)} className="neon-btn p-3 sm:px-4 sm:py-3 rounded-xl flex items-center gap-2" title="Guía de Instalación">
                  <Target className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Guía</span>
                </button>
                <button id="btn-camera" onClick={() => setShowDebug(!showDebug)} className={`neon-btn p-3 sm:px-4 sm:py-3 rounded-xl flex items-center gap-2 ${showDebug ? 'active' : ''}`} title="Mostrar/Ocultar Cámara">
                  <Camera className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Cámara</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="relative z-10 text-[11px] font-mono tracking-wide text-rose-400 bg-rose-500/10 p-4 rounded-xl border border-rose-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.1)]">
              ⚠ SYSTEM ERROR: {error}
            </div>
          )}

          {/* Main Dashboard Content Layout */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-6 items-stretch min-h-[280px]">
            
            {/* Left: Instructions & Controls */}
            <div className="flex flex-col justify-between glass-panel rounded-2xl p-6 relative overflow-hidden group hover:border-[rgba(0,245,212,0.3)] transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[rgba(0,245,212,0.05)] rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-[#00f5d4] rounded-full shadow-[0_0_8px_#00f5d4]" />
                  <h3 className="text-xs uppercase tracking-[0.2em] text-[#00f5d4] font-bold">Mapeo Biométrico</h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-6 font-light">
                  Extiende tu palma abierta frente a la cámara. El cursor escaneará tu movimiento en 3D para abarcar toda la pantalla con absoluta fluidez.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(0,245,212,0.1)] flex items-center justify-center border border-[rgba(0,245,212,0.2)]">
                      <div className="w-3 h-3 rounded-full bg-[#00f5d4] shadow-[0_0_10px_#00f5d4]" />
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Click Principal</span>
                      <span className="block text-xs font-bold text-white tracking-wide">Pulgar + Índice</span>
                    </div>
                  </div>
                  
                  <div className="bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(245,158,11,0.1)] flex items-center justify-center border border-[rgba(245,158,11,0.2)]">
                      <div className="w-3 h-3 rounded-full bg-[#f59e0b] shadow-[0_0_10px_#f59e0b]" />
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Click Secundario</span>
                      <span className="block text-xs font-bold text-white tracking-wide">Pulgar + Medio</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle: Y-Offset Vertical Slider */}
            <div className="w-24 glass-panel rounded-2xl p-4 flex flex-col items-center justify-between">
               <span className="text-[10px] font-bold text-[#00f5d4] uppercase tracking-widest text-center pt-2 opacity-80">Eje Z <br/><span className="text-[8px] font-normal opacity-70">(Altura)</span></span>
               <div className="relative h-full w-full flex items-center justify-center my-4">
                 <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full" style={{ background: 'linear-gradient(to bottom, rgba(0,245,212,0.1), rgba(0,245,212,0.6), rgba(0,245,212,0.1))' }} />
                 <input
                   type="range" min="-0.5" max="0.5" step="0.01" value={yOffset}
                   onChange={(e) => setYOffset(parseFloat(e.target.value))}
                   className="slider-base slider-neon h-full origin-center cursor-pointer relative z-10"
                   style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '6px', WebkitAppearance: 'slider-vertical' } as any}
                 />
               </div>
               <div className="bg-black/50 border border-[rgba(0,245,212,0.3)] px-3 py-1.5 rounded-lg shadow-[0_0_15px_rgba(0,245,212,0.1)]">
                 <span className="text-[11px] font-mono font-bold text-[#00f5d4]">
                   {yOffset > 0 ? '+' : ''}{Math.round(yOffset * 100)}
                 </span>
               </div>
            </div>

            {/* Right: Camera Feed (if active) */}
            <div className={`transition-all duration-500 origin-left ${showDebug ? 'w-[360px] opacity-100' : 'w-0 opacity-0 overflow-hidden ml-0 md:ml-[-1.5rem]'} glass-panel rounded-2xl p-2 relative flex-shrink-0 flex items-center justify-center bg-black/40`}>
              {showDebug && (
                 <div className="relative w-full aspect-video rounded-xl overflow-hidden neon-border shadow-2xl">
                   <video
                     ref={(el) => {
                       if (el && videoRef.current && el.srcObject !== videoRef.current.srcObject) {
                         el.srcObject = videoRef.current.srcObject;
                         el.play().catch(() => console.log("Play interrupted"));
                       }
                     }}
                     className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                     muted playsInline
                   />
                   <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10" />
                   {/* Scan line overlay */}
                   <div className="absolute inset-0 z-20 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,245,212,0.02) 3px, rgba(0,245,212,0.02) 4px)' }} />
                   
                   <div className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/10">
                     <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f43f5e', boxShadow: '0 0 8px #f43f5e' }} />
                     <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white">LIVE VISUALS</span>
                   </div>
                   <div className="absolute bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                     <span className="text-[9px] uppercase tracking-[0.2em] text-[#00f5d4] font-mono font-bold block text-center">Neural Tracking Core 2.0</span>
                   </div>
                 </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* ─────────── SETTINGS PANEL ─────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-auto p-4"
          style={{ animation: 'fadeInUp 0.2s ease' }}>
          <div className="glass-panel-strong rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">

            {/* Panel Header */}
            <div className="sticky top-0 rounded-t-3xl flex justify-between items-center p-6 pb-4 z-10"
              style={{ background: 'rgba(5,10,22,0.95)', borderBottom: '1px solid rgba(0,245,212,0.1)' }}>
              <h2 className="text-base font-bold flex items-center gap-3 text-white">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(0,245,212,0.2), rgba(14,165,233,0.2))', border: '1px solid rgba(0,245,212,0.3)' }}>
                  <Settings2 className="w-4 h-4 text-neon" />
                </div>
                Ajustes del Sistema
              </h2>
              <button onClick={() => setSettingsOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-7">

              {/* Connection */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(0,245,212,0.4), transparent)' }} />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-neon font-semibold">Conexión Backend</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(0,245,212,0.4), transparent)' }} />
                </div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">WebSocket URL</label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => handleWsUrlChange(e.target.value)}
                  placeholder="ws://localhost:3001"
                  className="w-full rounded-xl px-4 py-3 text-xs text-white outline-none font-mono transition-all"
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,212,0.2)', color: '#00f5d4' }}
                />
                <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
                  Usa <span className="text-slate-400">ws://localhost:3001</span> en este dispositivo. Para otro dispositivo usa su IP local (ej. <span className="text-slate-400">ws://192.168.1.100:3001</span>).
                </p>
              </div>

              {/* Movement */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(0,245,212,0.4), transparent)' }} />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-neon font-semibold">Movimiento 3D Fluido</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(0,245,212,0.4), transparent)' }} />
                </div>

                <div className="space-y-5">

                  {/* PosX */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">Posición X</span>
                      <span className="text-xs font-mono text-neon">{posSensitivityX.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={posSensitivityX}
                      onChange={e => setPosSensitivityX(parseFloat(e.target.value))}
                      className="slider-base slider-neon" />
                  </div>

                  {/* PosY */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">Posición Y</span>
                      <span className="text-xs font-mono text-neon">{posSensitivityY.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={posSensitivityY}
                      onChange={e => setPosSensitivityY(parseFloat(e.target.value))}
                      className="slider-base slider-neon" />
                  </div>

                  {/* RotX */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.8)' }}>Rotación Mano X</span>
                      <span className="text-xs font-mono" style={{ color: '#a855f7' }}>{rotSensitivityX.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0" max="6.0" step="0.2" value={rotSensitivityX}
                      onChange={e => setRotSensitivityX(parseFloat(e.target.value))}
                      className="slider-base slider-purple" />
                  </div>

                  {/* RotY */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.8)' }}>Rotación Mano Y</span>
                      <span className="text-xs font-mono" style={{ color: '#a855f7' }}>{rotSensitivityY.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0" max="6.0" step="0.2" value={rotSensitivityY}
                      onChange={e => setRotSensitivityY(parseFloat(e.target.value))}
                      className="slider-base slider-purple" />
                  </div>

                  {/* Smoothing */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(16,185,129,0.8)' }}>Suavizado Orgánico</span>
                      <span className="text-xs font-mono" style={{ color: '#10b981' }}>{Math.round(smoothing * 100)}%</span>
                    </div>
                    <input type="range" min="0.1" max="0.95" step="0.05" value={smoothing}
                      onChange={e => setSmoothing(parseFloat(e.target.value))}
                      className="slider-base"
                      style={{ '--thumb-color': '#10b981' } as any} />
                    <style>{`.slider-base.green::-webkit-slider-thumb { background: #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.6); }`}</style>
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(0,245,212,0.4), transparent)' }} />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-neon font-semibold">Apariencia del Cursor</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(0,245,212,0.4), transparent)' }} />
                </div>

                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">Estilo</label>
                <select value={cursorStyle} onChange={e => setCursorStyle(e.target.value as any)}
                  className="w-full rounded-xl px-4 py-3 text-xs text-white outline-none mb-4 transition-all"
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,212,0.2)' }}>
                  <option value="classic">● Clásico (Flecha)</option>
                  <option value="dot">◆ Punto Minimalista</option>
                  <option value="crosshair">✛ Mira (Crosshair)</option>
                  <option value="ring">◎ Anillo (Target)</option>
                </select>

                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">Color</label>
                <div className="flex gap-3">
                  <select value={colorMode} onChange={e => setColorMode(e.target.value as any)}
                    className="flex-1 rounded-xl px-4 py-3 text-xs text-white outline-none transition-all"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,212,0.2)' }}>
                    <option value="custom">Color Fijo</option>
                    <option value="dynamic">Dinámico (Camaleón)</option>
                  </select>
                  {colorMode === 'custom' && (
                    <input type="color" value={cursorColor} onChange={e => setCursorColor(e.target.value)}
                      className="w-12 h-12 rounded-xl cursor-pointer p-1"
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,212,0.2)' }} />
                  )}
                </div>
                {colorMode === 'dynamic' && (
                  <p className="text-[10px] text-slate-600 mt-2">El cursor adopta el color del entorno detrás de tu mano.</p>
                )}
              </div>

              {/* Gestures */}
              <div>
                <div className="flex items-center justify-between p-4 rounded-2xl mb-6" style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.1)' }}>
                  <div className="flex-1 pr-4">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-rose-400 block mb-1">Protección Anti-Mistouch</span>
                    <p className="text-[9px] text-slate-500 leading-relaxed italic">Bloquea gestos automáticamente si la mano no apunta a la pantalla para evitar clics accidentales.</p>
                  </div>
                  <button 
                    onClick={() => setAntiMistouch(!antiMistouch)}
                    className={`w-12 h-6 rounded-full transition-all relative flex items-center px-1 ${antiMistouch ? 'bg-rose-500/30' : 'bg-slate-800'}`}
                    style={{ border: `1px solid ${antiMistouch ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.1)'}` }}
                  >
                    <div className={`w-4 h-4 rounded-full shadow-lg transform transition-all duration-300 ${antiMistouch ? 'translate-x-6 bg-rose-400' : 'translate-x-0 bg-slate-500'}`} />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(0,245,212,0.4), transparent)' }} />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-neon font-semibold">Gestos Personalizados</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(0,245,212,0.4), transparent)' }} />
                </div>
                <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">Junta el pulgar con cada dedo para activar la acción asignada.</p>

                <div className="space-y-3">
                  {(['index', 'middle', 'ring', 'pinky'] as const).map((finger, idx) => {
                    const labels = ['Índice', 'Medio', 'Anular', 'Meñique'];
                    const colors = ['#00f5d4', '#0ea5e9', '#a855f7', '#f59e0b'];
                    return (
                      <div key={finger} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${colors[idx]}22` }}>
                        <label className="block text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: colors[idx] }}>
                          ▸ Pulgar + {labels[idx]}
                        </label>
                        <select
                          value={gestureMap[finger]}
                          onChange={e => setGestureMap({ ...gestureMap, [finger]: e.target.value as GestureAction })}
                          className="w-full rounded-lg px-3 py-2 text-xs text-white outline-none transition-all"
                          style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${colors[idx]}33` }}
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

              {/* Click Effect Image */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(0,245,212,0.4), transparent)' }} />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-neon font-semibold">Efecto Visual de Click</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, rgba(0,245,212,0.4), transparent)' }} />
                </div>
                <input
                  type="file"
                  accept="image/png, image/gif"
                  onChange={handleImageUpload}
                  className="block w-full text-[10px] text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:cursor-pointer mb-3"
                  style={{ '--file-bg': 'rgba(0,245,212,0.1)', '--file-color': '#00f5d4' } as any}
                />
                {clickImage && (
                  <div className="space-y-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,245,212,0.1)' }}>
                    <p className="text-[10px] text-slate-500">Click en la imagen para fijar el punto de anclaje:</p>
                    <div className="flex justify-center">
                      <div className="relative inline-block rounded-lg overflow-hidden cursor-crosshair border" style={{ borderColor: 'rgba(0,245,212,0.2)' }} onClick={handleHotspotClick}>
                        <img src={clickImage} alt="Preview" className="max-w-[180px] max-h-[120px] object-contain pointer-events-none" />
                        <div className="absolute w-3 h-3 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${clickImageHotspot.x}%`, top: `${clickImageHotspot.y}%`, border: '2px solid #f43f5e', boxShadow: '0 0 6px #f43f5e' }} />
                      </div>
                    </div>
                    <button onClick={() => setClickImage(null)}
                      className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-rose-400 rounded-xl transition-colors"
                      style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)' }}>
                      ✕ Quitar imagen
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ─────────── VIRTUAL CURSOR ─────────── */}
      {isReady && (() => {
        const activeColor = colorMode === 'dynamic' ? cursorPos.color : cursorColor;
        const rotation = cursorPos.angle;
        const isCentered = cursorStyle !== 'classic';
        const isClicking = isLeftClick || isRightClick;
        const clickColor = isRightClick ? '#f59e0b' : activeColor;

        return (
          <div
            id="virtual-cursor"
            className="fixed top-0 left-0 z-[60] pointer-events-none"
            style={{
              transform: `translate(${cursorPos.x}px, ${cursorPos.y}px) rotate(${rotation}deg)`,
              transition: 'transform 50ms linear'
            }}
          >
            {/* Custom Click Image */}
            {clickImage && isClicking && (
              <img
                src={clickImage}
                alt="Click Effect"
                className="absolute pointer-events-none z-10"
                style={{
                  left: 0, top: 0,
                  transform: `translate(-${clickImageHotspot.x}%, -${clickImageHotspot.y}%)`,
                  maxWidth: '150px', maxHeight: '150px'
                }}
              />
            )}

            <div className="relative" style={{ transform: isCentered ? 'translate(-50%, -50%)' : 'none' }}>

              {cursorStyle === 'classic' && (
                <MousePointer2
                  className="w-8 h-8 drop-shadow-lg transition-all duration-100"
                  style={{
                    color: isClicking ? clickColor : activeColor,
                    fill: isLeftClick ? activeColor : isRightClick ? '#f59e0b' : 'rgba(255,255,255,0.7)',
                    filter: `drop-shadow(0 0 8px ${clickColor})`,
                    transform: isClicking ? 'scale(0.8)' : 'scale(1)',
                    transformOrigin: '0 0'
                  }}
                />
              )}

              {cursorStyle === 'dot' && (
                <div
                  className="w-5 h-5 rounded-full transition-all duration-100"
                  style={{
                    background: isClicking ? clickColor : 'transparent',
                    border: `2px solid ${isClicking ? clickColor : activeColor}`,
                    boxShadow: `0 0 12px ${isClicking ? clickColor : activeColor}`,
                    transform: isClicking ? 'scale(0.7)' : 'scale(1)'
                  }}
                />
              )}

              {cursorStyle === 'crosshair' && (
                <Crosshair
                  className="w-7 h-7 transition-all duration-100"
                  style={{
                    color: isClicking ? clickColor : activeColor,
                    filter: `drop-shadow(0 0 6px ${isClicking ? clickColor : activeColor})`,
                    transform: isClicking ? 'scale(0.85)' : 'scale(1)'
                  }}
                />
              )}

              {cursorStyle === 'ring' && (
                <Target
                  className="w-7 h-7 transition-all duration-100"
                  style={{
                    color: isClicking ? clickColor : activeColor,
                    filter: `drop-shadow(0 0 8px ${isClicking ? clickColor : activeColor})`,
                    transform: isClicking ? 'scale(0.85)' : 'scale(1)'
                  }}
                />
              )}

              {/* Ripple on click */}
              {!clickImage && isClicking && (
                <div
                  className="absolute rounded-full"
                  style={{
                    width: '40px', height: '40px',
                    top: isCentered ? '0' : '4px',
                    left: isCentered ? '0' : '4px',
                    transform: 'translate(-50%, -50%)',
                    border: `2px solid ${clickColor}`,
                    boxShadow: `0 0 20px ${clickColor}`,
                    animation: 'ripple 0.4s ease-out forwards'
                  }}
                />
              )}

              {/* Click State Label */}
              <div className="absolute top-full mt-3 left-0 whitespace-nowrap" style={{ transform: `rotate(${-rotation}deg)` }}>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full transition-opacity duration-100 ${isClicking ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: `${clickColor}22`, color: clickColor, border: `1px solid ${clickColor}44` }}>
                  {isLeftClick ? '← Left Click' : isRightClick ? 'Right Click →' : ''}
                </span>
              </div>

              {/* Anti-Mistouch Block Indicator */}
              <div className="absolute bottom-full mb-3 left-0 whitespace-nowrap" style={{ transform: `rotate(${-rotation}deg)` }}>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 transition-opacity duration-300 ${isHandExtremeAngleRef.current ? 'opacity-100' : 'opacity-0'}`}>
                  ⚠ Ángulo Bloqueado
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────── ONBOARDING / INSTALL GUIDE ─────────── */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', animation: 'fadeInUp 0.3s ease' }}>
          <div className="glass-panel-strong rounded-3xl p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">

            {/* WS status at top */}
            <div className="flex items-center gap-2 mb-5">
              <div className={`w-2.5 h-2.5 rounded-full ${
                wsStatus === 'connected' ? 'status-dot-connected' :
                wsStatus === 'connecting' ? 'status-dot-connecting animate-pulse' :
                wsStatus === 'error' ? 'status-dot-error' : 'status-dot-disconnected'
              }`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {wsStatus === 'connected' ? 'PC Conectada' :
                 wsStatus === 'connecting' ? 'Buscando PC...' :
                 wsStatus === 'error' ? 'Error de Conexión' : 'Sin Conexión'}
              </span>
            </div>

            <div className="flex justify-between items-center mb-7">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #00f5d4, #0ea5e9)', boxShadow: '0 0 20px rgba(0,245,212,0.3)' }}>
                  <MousePointer2 className="w-5 h-5 text-black" />
                </div>
                Configuración Inicial
              </h2>
              <button onClick={closeOnboarding}
                className="p-2 rounded-xl text-slate-400 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">

              {/* Step 1 */}
              <div className="flex gap-4 p-4 rounded-2xl" style={{ background: 'rgba(0,245,212,0.04)', border: '1px solid rgba(0,245,212,0.1)' }}>
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-black" style={{ background: 'linear-gradient(135deg, #00f5d4, #0ea5e9)' }}>1</div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Inicia el Servidor</h3>
                  <p className="text-slate-400 text-xs mb-3 leading-relaxed">Copia y pega este comando en tu Terminal para iniciar el controlador:</p>
                  <code className="block p-3 rounded-xl text-[10px] text-neon border font-mono leading-relaxed" style={{ background: 'rgba(0,0,0,0.6)', borderColor: 'rgba(0,245,212,0.2)' }}>
                    cd ~/Downloads/hand-tracking-cursor && python3 mouse_controller.py
                  </code>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 p-4 rounded-2xl" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.1)' }}>
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-black" style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>2</div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Permisos de macOS</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">Activa <span className="text-slate-200 font-semibold">Accesibilidad</span> para tu Terminal:</p>
                  <p className="text-[10px] italic mt-1" style={{ color: 'rgba(14,165,233,0.7)' }}>Settings → Privacy & Security → Accessibility</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 p-4 rounded-2xl" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>3</div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">Conecta el Dispositivo</h3>
                  <p className="text-slate-400 text-xs mb-3 leading-relaxed">Si usas el link automático ya deberías estar conectado. Si no, ingresa la IP de tu Mac:</p>
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => handleWsUrlChange(e.target.value)}
                    placeholder="ws://192.168.1.XX:3001"
                    className="w-full rounded-xl px-4 py-2 text-xs text-white outline-none transition-all font-mono"
                    style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}
                  />
                </div>
              </div>

              {/* HTTPS warning */}
              {wsStatus === 'error' && window.location.protocol === 'https:' && (
                <div className="p-4 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <span className="text-rose-400 text-lg flex-shrink-0">⚠</span>
                  <p className="text-[10px] text-rose-300 leading-relaxed">
                    <b className="text-rose-400 uppercase tracking-widest">Bloqueo HTTPS:</b> Tu navegador no permite la conexión desde HTTPS a un servidor local.
                    Abre el link HTTP de la terminal (sin la 's') o permite contenido no seguro.
                  </p>
                </div>
              )}

              {/* Pro tip */}
              <div className="p-4 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.15)' }}>
                <span className="text-neon text-base flex-shrink-0">✦</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <b className="text-neon uppercase tracking-widest">Modo Fondo:</b> El sistema ejecuta el tracking en segundo plano automáticamente usando un Web Worker, sin necesidad de configuración adicional.
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={closeOnboarding}
                className="w-full py-4 font-bold rounded-2xl text-sm uppercase tracking-widest text-black transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00f5d4 0%, #0ea5e9 100%)',
                  boxShadow: '0 0 30px rgba(0,245,212,0.3)'
                }}
              >
                ¡Activar Sistema →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
