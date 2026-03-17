/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Camera, MousePointer2, 
  Hand, 
  Terminal,
  Link,
  Info, Crosshair, Target, Settings2, X, Power, ShieldCheck, Zap } from 'lucide-react';

// Smoothing factor for cursor movement (0 to 1, higher is smoother but slower)
const DEFAULT_SMOOTHING = 0.9;
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
  const [cursorStyle, setCursorStyle] = useState<'classic' | 'dot' | 'crosshair' | 'ring'>(() => (localStorage.getItem('cursorStyle') as any) || 'classic');
  const [colorMode, setColorMode] = useState<'custom' | 'dynamic'>(() => (localStorage.getItem('colorMode') as any) || 'custom');
  const [cursorColor, setCursorColor] = useState(() => localStorage.getItem('cursorColor') || '#3b82f6');
  // Sensibilidad Dual
  const [posSensitivityX, setPosSensitivityX] = useState(() => parseFloat(localStorage.getItem('posSensitivityX') || DEFAULT_SCALE_FACTOR.toString()));
  const [posSensitivityY, setPosSensitivityY] = useState(() => parseFloat(localStorage.getItem('posSensitivityY') || DEFAULT_SCALE_FACTOR.toString()));
  const [rotSensitivityX, setRotSensitivityX] = useState(() => parseFloat(localStorage.getItem('rotSensitivityX') || '1.0'));
  const [rotSensitivityY, setRotSensitivityY] = useState(() => parseFloat(localStorage.getItem('rotSensitivityY') || '1.0'));
  const [smoothing, setSmoothing] = useState(() => parseFloat(localStorage.getItem('smoothing') || DEFAULT_SMOOTHING.toString()));
  const [gestureMap, setGestureMap] = useState<Record<string, GestureAction>>({
    index: 'click_left',
    middle: 'click_right',
    ring: 'scroll',
    pinky: 'key_f3'
  });
  // Se mantienen para retrocompatibilidad pero se esconden o ignoran en la lógica de trabas
  const [angleControlEnabled, setAngleControlEnabled] = useState(false);
  const [angleSensitivity, setAngleSensitivity] = useState(1.5);
  const [activationThreshold, setActivationThreshold] = useState(45);
  const [clickImage, setClickImage] = useState<string | null>(() => localStorage.getItem('clickImage'));
  const [clickImageHotspot, setClickImageHotspot] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('clickImageHotspot') || '{"x": 50, "y": 50}');
    } catch {
      return { x: 50, y: 50 };
    }
  });

  const [antiMistouch, setAntiMistouch] = useState(() => {
    return localStorage.getItem('antiMistouchEnabled') !== 'false';
  });
  const [isPipActive, setIsPipActive] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') === 'true') return true;
    return localStorage.getItem('systemEnabled') !== 'false';
  });
  const [isAutoStarting, setIsAutoStarting] = useState(false);

  const [setupStep, setSetupStep] = useState<'checking' | 'permissions' | 'installing' | 'ready'>(() => {
    return (localStorage.getItem('setupCompleted') === 'true') ? 'ready' : 'checking';
  });
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [accessibilityAllowed, setAccessibilityAllowed] = useState(false);
  const [installMessage, setInstallMessage] = useState('Analizando entorno...');
  
  const wakeLockRef = useRef<any>(null);
  const electronAPI = (window as any).electronAPI;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Auto-enable system if requested via URL
    if (params.get('auto') === 'true') {
      setSystemEnabled(true);
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
    colorModeRef.current = colorMode;
    posSensitivityXRef.current = posSensitivityX;
    posSensitivityYRef.current = posSensitivityY;
    rotSensitivityXRef.current = rotSensitivityX;
    rotSensitivityYRef.current = rotSensitivityY;
    smoothingRef.current = smoothing;
    gestureMapRef.current = gestureMap;
    angleControlRef.current = angleControlEnabled;
    angleSensitivityRef.current = angleSensitivity;
    activationThresholdRef.current = activationThreshold;
    antiMistouchRef.current = antiMistouch;
  }, [colorMode, posSensitivityX, posSensitivityY, rotSensitivityX, rotSensitivityY, smoothing, gestureMap, angleControlEnabled, angleSensitivity, activationThreshold, antiMistouch]);



  useEffect(() => {
    if (!electronAPI) return;

    const checkSystem = async () => {
      const perms = await electronAPI.checkPermissions();
      const cameraOk = perms.camera === 'granted';
      const accessOk = perms.accessibility;
      const depsOk = perms.dependencies;
      
      setCameraAllowed(cameraOk);
      setAccessibilityAllowed(accessOk);

      if (setupStep === 'checking') {
        if (!cameraOk || !accessOk) {
          setSetupStep('permissions');
        } else if (!depsOk) {
          startSetupFlow();
        } else {
          // All good
          localStorage.setItem('setupCompleted', 'true');
          setSetupStep('ready');
          if (!systemEnabled) handleToggleSystem(true);
        }
      } else if (setupStep === 'ready' && !systemEnabled && !isAutoStarting) {
        setIsAutoStarting(true);
        handleToggleSystem(true);
      }
    };

    const startSetupFlow = async () => {
      setSetupStep('installing');
      setInstallMessage('Verificando y configurando componentes de Python...');
      const success = await electronAPI.startInstallation();
      if (success) {
        localStorage.setItem('setupCompleted', 'true');
        setSetupStep('ready');
        handleToggleSystem(true);
      } else {
        setInstallMessage('Error en la configuración automática. Por favor, asegúrate de tener conexión a internet y reinicia la aplicación.');
        // Don't force advance to ready if it failed
      }
    };

    checkSystem();

    const unsubs = [
      electronAPI.onSetupStatus((msg: string) => setInstallMessage(msg)),
      electronAPI.onRequestAccessibility(() => setSetupStep('permissions'))
    ];

    return () => {
      unsubs.forEach(u => u?.());
    };
  }, [electronAPI, setupStep]);
  useEffect(() => {
    if (!electronAPI || setupStep !== 'permissions') return;

    console.log('[App] Starting permission polling...');
    const pollInterval = setInterval(async () => {
      const perms = await electronAPI.checkPermissions();
      const cameraOk = perms.camera === 'granted';
      const accessOk = perms.accessibility;
      
      console.log(`[Permission Poll] Camera: ${perms.camera}, Accessibility: ${accessOk}`);

      if (cameraOk !== cameraAllowed) setCameraAllowed(cameraOk);
      if (accessOk !== accessibilityAllowed) setAccessibilityAllowed(accessOk);

      if (cameraOk && accessOk) {
        console.log('[Permission Poll] Both permissions granted! Advancing...');
        clearInterval(pollInterval);
        setSetupStep('checking'); // Re-trigger flow
      }
    }, 1000);

    return () => {
      console.log('[App] Stopping permission polling.');
      clearInterval(pollInterval);
    };
  }, [setupStep, electronAPI, cameraAllowed, accessibilityAllowed]);

  const handleToggleSystem = async (enabled: boolean) => {
    if (!electronAPI) return;
    const success = await electronAPI.toggleSystem(enabled);
    if (success) {
      setSystemEnabled(enabled);
      localStorage.setItem('systemEnabled', enabled.toString());
      if (!enabled) { /* cleanup if needed */ }
    }
  };

  const handleGrantPermissions = async () => {
    if (!electronAPI) return;
    setInstallMessage('Validando credenciales biométricas...');
    const perms = await electronAPI.requestPermissions();
    if (perms.camera === 'granted' && perms.accessibility) {
       handleStartInstallation();
    }
  };

  const handleStartInstallation = async () => {
    if (!electronAPI) return;
    setSetupStep('installing');
    setInstallMessage('Sincronizando Neural Cursor con el kernel de macOS...');
    
    // Small delay for UI feedback
    await new Promise(r => setTimeout(r, 1000));
    
    const success = await electronAPI.startInstallation();
    if (success) {
      setSetupStep('ready');
      setIsReady(true);
      localStorage.setItem('setupCompleted', 'true');
      if (systemEnabled) {
        electronAPI.toggleSystem(true);
      }
    } else {
      setInstallMessage('La sincronización falló. Verifica tu conexión e intenta abrir la app nuevamente.');
    }
  };

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
            const MAGIC_YAW = 25.0;   // Incrementado para mayor respuesta tipo "puntero"
            const MAGIC_PITCH = 18.0; // Incrementado para mayor respuesta vertical
            
            rawNormX = baseNormX + (rotationGimbalRef.current.yaw * rotSensitivityXRef.current * MAGIC_YAW);
            rawNormY = baseNormY + (rotationGimbalRef.current.pitch * rotSensitivityYRef.current * MAGIC_PITCH);
          } else {
            rawNormX = baseNormX;
            rawNormY = baseNormY;
          }

          // Simplify normalization: Directly map camera space to screen space
          // With smoothing and a slight scale factor for range.
          const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
          
          const rawClampedX = Math.max(0, Math.min(1, rawNormX));
          const rawClampedY = Math.max(0, Math.min(1, rawNormY));

          smoothedNormPosRef.current.x = lerp(smoothedNormPosRef.current.x, rawClampedX, 1 - s);
          smoothedNormPosRef.current.y = lerp(smoothedNormPosRef.current.y, rawClampedY, 1 - s);

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

          // 2. Detect Gestures and Actions
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const middleTip = landmarks[12];
          const ringTip = landmarks[16];
          const pinkyTip = landmarks[20];

          // --- Robust Orientation Detection (3D Palm Normal) ---
          let isPalmFacing = true;
          let isFlipped = false;

          if (results.worldLandmarks && results.worldLandmarks.length > 0) {
            const world = results.worldLandmarks[0];
            const handedness = results.handednesses?.[0]?.[0]?.categoryName || 'Right';
            
            // Vectors for plane calculation: Wrist(0), IndexMCP(5), PinkyMCP(17)
            const wrist = world[0];
            const indexMcp = world[5];
            const pinkyMcp = world[17];

            const v1 = { x: indexMcp.x - wrist.x, y: indexMcp.y - wrist.y, z: indexMcp.z - wrist.z };
            const v2 = { x: pinkyMcp.x - wrist.x, y: pinkyMcp.y - wrist.y, z: pinkyMcp.z - wrist.z };

            // Cross product: N = V1 x V2
            // nx = v1.y * v2.z - v1.z * v2.y
            // ny = v1.z * v2.x - v1.x * v2.z
            // nz = v1.x * v2.y - v1.y * v2.x
            const nz = v1.x * v2.y - v1.y * v2.x;
            
            // Handedness correction: In Mediapipe, Z is towards the camera for worldLandmarks.
            // For a right hand, the normal vector from Wrist->Index and Wrist->Pinky points "up" (out of palm).
            // If nz > 0, the palm is facing the camera. If nz < 0, it's flipped.
            // Inverse for Left hand.
            if (handedness === 'Right') {
              isPalmFacing = nz > 0;
            } else {
              isPalmFacing = nz < 0;
            }
            isFlipped = !isPalmFacing;
          }

          // --- Anti-Mistouch Protection ---
          let isHandFacingOut = false;
          if (antiMistouchRef.current) {
            const isPitchExtreme = Math.abs(rotationGimbalRef.current.pitch) > 0.40;
            const isYawExtreme = Math.abs(rotationGimbalRef.current.yaw) > 0.45;
            isHandFacingOut = isPitchExtreme || isYawExtreme;
          }
          
          const canInteract = !isFlipped && !isHandFacingOut;
          isHandExtremeAngleRef.current = !canInteract;

          // Gated MOVE synchronization (Only move if hand is facing correctly)
          if (electronAPI && canInteract) {
            electronAPI.syncAction({ 
              type: 'move', 
              nx: smoothedNormPosRef.current.x, 
              ny: smoothedNormPosRef.current.y 
            });
          }

          const canStartGesture = canInteract;

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
            const isOpen = systemEnabled && !!electronAPI;

            // Left/Right Click & Drag (Continuous hold)
            if (action.startsWith('click_') || action === 'drag') {
              const btn = action.includes('right') ? 'right' : 'left';
              if (isActive && !wasActive) {
                    if (btn === 'left') { isDraggingRef.current = true; setIsLeftClick(true); }
                    else { setIsRightClick(true); }
                    console.log(`Sending action: mouse_down (${btn})`);
                    if (isOpen) electronAPI.syncAction({ type: 'mouse_down', button: btn });
              } else if (!isActive && wasActive) {
                    if (btn === 'left') { isDraggingRef.current = false; setIsLeftClick(false); }
                    else { setIsRightClick(false); }
                    console.log(`Sending action: mouse_up (${btn})`);
                    if (isOpen) electronAPI.syncAction({ type: 'mouse_up', button: btn });
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
                  if (isOpen) electronAPI.syncAction({ type: 'scroll', delta: scrollAmount });
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
                if (isOpen) electronAPI.syncAction({ type, direction: dir });
              }
              else if (action.startsWith('key_') || action.match(/^f(1[0-2]|[1-9])$/i)) {
                const keyName = action.startsWith('key_') ? action.replace('key_', '') : action;
                if (isOpen) {
                  console.log('Sending key gesture:', keyName);
                  electronAPI.syncAction({ type: 'key', key: keyName });
                }
              }
              else if (action.startsWith('hotkey_')) {
                const combo = action.replace('hotkey_', '');
                let keys: string[] = [];
                if (combo === 'copy') keys = ['cmd', 'c'];
                if (combo === 'paste') keys = ['cmd', 'v'];
                if (combo === 'undo') keys = ['cmd', 'z'];
                
                if (isOpen) electronAPI.syncAction({ type: 'hotkey', keys });
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
            // No hand detected or hand lost validity - release locks
            if (now - lastSeenHandTimeRef.current > 300 || isHandExtremeAngleRef.current) {
              if ((isDraggingRef.current || activeGesturesRef.current.middle) && electronAPI) {
                console.log("Force releasing mouse buttons (hand lost or flipped)");
                electronAPI.syncAction({ type: 'mouse_up', button: 'left' });
                electronAPI.syncAction({ type: 'mouse_up', button: 'right' });
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
    if (electronAPI) {
      electronAPI.syncAction({ type: 'click', button: type });
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

        .bg-neon { background: #00f5d4 !important; color: #000 !important; }
        .bg-neon:hover { box-shadow: 0 0 20px rgba(0,245,212,0.4); transform: scale(1.02); }
        .text-neon { color: #00f5d4; }

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
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #00f5d4 0%, #0ea5e9 100%)', boxShadow: '0 0 30px rgba(0,245,212,0.3)', animation: 'float 4s ease-in-out infinite' }}>
                <MousePointer2 className="w-7 h-7 text-black" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-2xl font-bold tracking-[0.2em] uppercase text-neon" style={{ textShadow: '0 0 10px rgba(0,245,212,0.3)' }}>Neural Cursor</h1>
                <p className="text-[10px] text-slate-400 tracking-[0.3em] uppercase mt-1">Advanced Hand Tracking v2.0</p>
              </div>

              {/* Central Status Indicator (Simplified Header) */}
              <div className="ml-8 hidden lg:flex items-center gap-3 px-4 py-2 rounded-xl bg-black/20 border border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${systemEnabled ? 'bg-neon shadow-[0_0_8px_#00f5d4]' : 'bg-slate-600'}`} />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {systemEnabled ? 'Sistema Online' : 'Sistema en Reposo'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Status indicators */}
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${systemEnabled ? 'status-dot-connected' : 'status-dot-disconnected'}`} />
                   <span className="text-[10px] uppercase tracking-[0.15em] font-mono text-slate-400 max-w-[90px] text-right">
                      {systemEnabled ? 'BACKEND: ON' : 'BACKEND: OFF'}
                   </span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isReady ? 'status-dot-connected' : 'status-dot-connecting animate-pulse'}`} />
                   <span className="text-[10px] uppercase tracking-[0.15em] font-mono font-bold max-w-[90px] text-right" style={{ color: isReady ? '#00f5d4' : '#f59e0b', textShadow: isReady ? '0 0 10px rgba(0,245,212,0.5)' : 'none' }}>
                      {isReady ? 'AI: ACTIVE' : 'CALIBRATING'}
                   </span>
                 </div>


              {/* Action Buttons */}
              <div className="flex gap-3">
                <button id="btn-settings" onClick={() => setSettingsOpen(true)} className="neon-btn p-3 sm:px-4 sm:py-3 rounded-xl flex items-center gap-2" title="Ajustes del Sistema">
                  <Settings2 className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Ajustes</span>
                </button>
                <button id="btn-guide" onClick={() => setShowOnboarding(true)} className="neon-btn p-3 sm:px-4 sm:py-3 rounded-xl flex items-center gap-2" title="Guía de Interacción">
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

          {/* Main Dashboard Content Layout - GRID 12 COLS */}
          <div className="relative z-10 grid grid-cols-12 gap-6 items-stretch min-h-[420px]">
            
            {/* Left: Instructions & Controls (COL 4) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              <div className="flex flex-col justify-between glass-panel rounded-3xl p-6 h-full relative overflow-hidden group hover:border-[rgba(0,245,212,0.3)] transition-all cursor-default">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[rgba(0,245,212,0.05)] rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-[#00f5d4] rounded-full shadow-[0_0_8px_#00f5d4]" />
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#00f5d4] font-black">Mapeo Biométrico</h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Extiende tu palma frente a la cámara. El sistema traduce cada milímetro en coordenadas precisas.
                  </p>
                  
                  <div className="space-y-3">
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4 group/item hover:bg-black/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-neon/10 flex items-center justify-center border border-neon/20 shadow-inner group-hover/item:shadow-[0_0_15px_rgba(0,245,212,0.2)] transition-all">
                        <div className="w-3 h-3 rounded-full bg-neon shadow-[0_0_10px_#00f5d4]" />
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase tracking-[0.2em] text-slate-500 mb-0.5">Mando Principal</span>
                        <span className="block text-xs font-black text-white uppercase tracking-widest">Pulgar + Índice</span>
                      </div>
                    </div>
                    
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4 group/item hover:bg-black/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner group-hover/item:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all">
                        <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase tracking-[0.2em] text-slate-500 mb-0.5">Mando Secundario</span>
                        <span className="block text-xs font-black text-white uppercase tracking-widest">Pulgar + Medio</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CENTER: MASTER POWER REACTOR (COL 4) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              <div className="glass-panel-strong rounded-[2.5rem] p-8 flex flex-col items-center justify-center gap-8 h-full relative overflow-hidden group">
                {/* Decorative Elements */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                   <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[60px] transition-all duration-1000 ${systemEnabled ? 'bg-neon/10' : 'bg-slate-900'}`} />
                   <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at center, rgba(0,245,212,0.03) 0%, transparent 70%)' }} />
                </div>

                <div className="relative z-10 text-center space-y-2">
                   <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Control Maestro</h3>
                   <p className={`text-[9px] font-bold uppercase tracking-widest ${systemEnabled ? 'text-neon' : 'text-slate-400'}`}>
                      {systemEnabled ? 'Reactor en Línea' : 'Sincronización Off'}
                   </p>
                </div>

                {/* BIG PROMINENT POWER BUTTON */}
                <button 
                  onClick={() => handleToggleSystem(!systemEnabled)}
                  className={`group relative w-48 h-48 rounded-full z-10 flex items-center justify-center transition-all duration-700 shadow-2xl overflow-hidden ${
                    systemEnabled 
                      ? 'bg-black border-2 border-neon/50 shadow-[0_0_50px_rgba(0,245,212,0.25)]' 
                      : 'bg-slate-900 border-2 border-white/5 hover:border-white/20'
                  }`}
                >
                   {/* Radial Pulse Effect when connected */}
                   {systemEnabled && <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-neon scale-75" style={{ animationDuration: '3s' }} />}
                   
                   <div className={`transition-all duration-500 flex flex-col items-center justify-center gap-3 ${systemEnabled ? 'scale-110' : 'scale-90 opacity-60'}`}>
                      <Power className={`w-12 h-12 transition-colors duration-500 ${systemEnabled ? 'text-neon drop-shadow-[0_0_15px_rgba(0,245,212,0.8)]' : 'text-slate-500'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-500 ${systemEnabled ? 'text-white' : 'text-slate-500'}`}>
                         {systemEnabled ? 'DESACTIVAR' : 'ACTIVAR SYSTEM'}
                      </span>
                   </div>

                   {/* Hover Glow */}
                   <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </button>

                <div className="relative z-10 flex gap-4 w-full justify-center mt-2">
                   <div className="bg-black/40 border border-white/5 px-4 py-2 rounded-xl flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${systemEnabled ? 'bg-neon animate-pulse' : 'bg-slate-700'}`} />
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Session: Auto</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Right: Camera & Automation (COL 4) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              {/* Camera Feed Card */}
              <div className="glass-panel rounded-3xl p-4 flex-1 flex flex-col gap-4 relative overflow-hidden group">
                 <div className="flex items-center justify-between">
                   <span className="text-[9px] font-black uppercase tracking-widest text-[#00f5d4] flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${showDebug ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-slate-600'}`} />
                      Neural Vision Engine
                   </span>
                   <button onClick={() => setShowDebug(!showDebug)} className="text-[8px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors">
                      {showDebug ? 'Minimizar' : 'Expandir'}
                   </button>
                 </div>
                 
                 <div className={`transition-all duration-500 flex-1 relative rounded-2xl overflow-hidden bg-black/60 border border-white/5 shadow-2xl ${showDebug ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
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
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-20" />
                    <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-black/80 to-transparent" />
                 </div>
              </div>

              {/* INTEGRATION STATUS CARD */}
              <div className="glass-panel-strong rounded-3xl p-6 border border-neon/10 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-3 opacity-20">
                    <ShieldCheck className="w-12 h-12 text-neon" />
                 </div>
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-4">Neural Integration</h3>
                 <p className="text-[9px] text-slate-500 leading-relaxed mb-6 uppercase tracking-wider">
                    Sincronización local directa activa. No se requiere configuración manual del sistema.
                 </p>
                 
                 <div className="flex items-center gap-3 bg-neon/10 border border-neon/20 p-4 rounded-2xl">
                    <Zap className="w-4 h-4 text-neon animate-pulse" />
                    <div>
                      <div className="text-[9px] font-black text-white uppercase tracking-widest">Motor Activo</div>
                      <div className="text-[8px] text-neon uppercase tracking-widest">Latencia Zero / Localhost IPC</div>
                    </div>
                 </div>
              </div>
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

            <div className="p-6 space-y-8 pb-12">

              {/* SECTION: MOTOR DE CONTROL */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-3.5 h-3.5 text-neon" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-neon font-black">Motor de Control</span>
                  <div className="h-px flex-1 bg-neon/10" />
                </div>
                
                <div className="bg-neon/5 border border-neon/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Estado del Enlace</span>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black ${systemEnabled ? 'bg-neon/20 text-neon shadow-[0_0_10px_rgba(0,245,212,0.2)]' : 'bg-slate-500/20 text-slate-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${systemEnabled ? 'bg-neon animate-pulse' : 'bg-slate-600'}`} />
                      {systemEnabled ? 'VINCULADO (IPC)' : 'DESCONECTADO'}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Sincronización nativa mediante Electron IPC.
                  </p>
                </div>
              </div>

              {/* SECTION: PRECISIÓN Y CONTROL */}
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Target className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-black">Precisión y Suavizado</span>
                  <div className="h-px flex-1 bg-blue-400/10" />
                </div>

                <div className="space-y-6">
                  {/* PosX & PosY Cluster */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Escala X</span>
                        <span className="text-xs font-mono text-neon">{posSensitivityX.toFixed(1)}x</span>
                      </div>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={posSensitivityX}
                        onChange={e => setPosSensitivityX(parseFloat(e.target.value))}
                        className="slider-base slider-neon w-full" />
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Escala Y</span>
                        <span className="text-xs font-mono text-neon">{posSensitivityY.toFixed(1)}x</span>
                      </div>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={posSensitivityY}
                        onChange={e => setPosSensitivityY(parseFloat(e.target.value))}
                        className="slider-base slider-neon w-full" />
                    </div>
                  </div>

                  {/* Rotation Cluster */}
                  <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase tracking-widest text-purple-400/80 font-bold">Giro de Muñeca X</span>
                        <span className="text-xs font-mono text-purple-400 font-black">{rotSensitivityX.toFixed(1)}</span>
                      </div>
                      <input type="range" min="0" max="6.0" step="0.2" value={rotSensitivityX}
                        onChange={e => setRotSensitivityX(parseFloat(e.target.value))}
                        className="slider-base slider-purple w-full" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase tracking-widest text-purple-400/80 font-bold">Giro de Muñeca Y</span>
                        <span className="text-xs font-mono text-purple-400 font-black">{rotSensitivityY.toFixed(1)}</span>
                      </div>
                      <input type="range" min="0" max="6.0" step="0.2" value={rotSensitivityY}
                        onChange={e => setRotSensitivityY(parseFloat(e.target.value))}
                        className="slider-base slider-purple w-full" />
                    </div>
                  </div>

                  {/* Smoothing */}
                  <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Suavizado Orgánico</span>
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">Filtro Antitemblor</span>
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-black">{Math.round(smoothing * 100)}%</span>
                    </div>
                    <input type="range" min="0.1" max="0.95" step="0.05" value={smoothing}
                      onChange={e => setSmoothing(parseFloat(e.target.value))}
                      className="slider-base w-full"
                      style={{ '--thumb-color': '#10b981' } as any} />
                  </div>
                </div>
              </div>

              {/* SECTION: GESTICULACIÓN */}
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-rose-400 font-black">Gesticulación e Inteligencia</span>
                  <div className="h-px flex-1 bg-rose-400/10" />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
                    <div className="flex-1 pr-6">
                      <span className="text-[10px] uppercase tracking-[0.2em] font-black text-rose-400 block mb-1">Protección Anti-Mistouch</span>
                      <p className="text-[9px] text-slate-500 leading-relaxed">Bloquea clics accidentales si la mano pierde el ángulo de control.</p>
                    </div>
                    <button 
                      onClick={() => setAntiMistouch(!antiMistouch)}
                      className={`w-12 h-7 rounded-full transition-all relative flex items-center px-1 shadow-inner ${antiMistouch ? 'bg-rose-500/40' : 'bg-slate-800'}`}
                      style={{ border: `1px solid ${antiMistouch ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.1)'}` }}
                    >
                      <div className={`w-5 h-5 rounded-full shadow-xl transform transition-all duration-500 ${antiMistouch ? 'translate-x-5 bg-white' : 'translate-x-0 bg-slate-500'}`} />
                    </button>
                  </div>

                  <div className="bg-white/5 border border-white/5 rounded-3xl p-5 space-y-4">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block pb-2 border-b border-white/5">Mapeo de Dedos (Pinza)</span>
                    <div className="grid grid-cols-1 gap-3">
                      {(['index', 'middle', 'ring', 'pinky'] as const).map((finger, idx) => {
                        const labels = ['Índice', 'Medio', 'Anular', 'Meñique'];
                        const colors = ['#00f5d4', '#0ea5e9', '#a855f7', '#f59e0b'];
                        return (
                          <div key={finger} className="flex items-center gap-3">
                            <div className="w-1.5 h-6 rounded-full" style={{ background: colors[idx] }} />
                            <div className="flex-1 flex items-center justify-between bg-black/30 rounded-xl px-4 py-2 border border-white/5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{labels[idx]}</span>
                              <select
                                value={gestureMap[finger]}
                                onChange={e => setGestureMap({ ...gestureMap, [finger]: e.target.value as GestureAction })}
                                className="bg-transparent text-[10px] font-black text-neon uppercase tracking-widest outline-none cursor-pointer text-right min-w-[120px]"
                              >
                                {GESTURE_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: APARIENCIA */}
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-black">Identidad Visual</span>
                  <div className="h-px flex-1 bg-amber-400/10" />
                </div>

                <div className="space-y-4 bg-white/5 border border-white/5 rounded-3xl p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold">Estilo de Cursor</label>
                       <select value={cursorStyle} onChange={e => setCursorStyle(e.target.value as any)}
                        className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none">
                        <option value="classic">Clásico</option>
                        <option value="dot">Punto</option>
                        <option value="crosshair">Mira</option>
                        <option value="ring">Anillo</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold">Modo de Color</label>
                       <select value={colorMode} onChange={e => setColorMode(e.target.value as any)}
                        className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-neon outline-none font-bold">
                        <option value="custom">Fijo</option>
                        <option value="dynamic">Dinámico</option>
                      </select>
                    </div>
                  </div>

                  {colorMode === 'custom' && (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-black/20 border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">Color Personalizado</span>
                      <input type="color" value={cursorColor} onChange={e => setCursorColor(e.target.value)}
                        className="w-10 h-8 rounded-lg cursor-pointer bg-transparent border-none" />
                    </div>
                  )}

                  <div className="pt-4 border-t border-white/5">
                    <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-3 text-center">Efecto Visual de Click</span>
                    <input
                      type="file"
                      accept="image/png, image/gif"
                      onChange={handleImageUpload}
                      className="block w-full text-[10px] text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:bg-neon/10 file:text-neon file:cursor-pointer"
                    />
                    {clickImage && (
                      <button onClick={() => setClickImage(null)}
                        className="w-full mt-3 py-2 text-[9px] font-black uppercase tracking-widest text-rose-400 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all">
                        Eliminar Efecto
                      </button>
                    )}
                  </div>
                </div>
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

      {/* ─────────── AUTOMATED SETUP OVERLAY ─────────── */}
      {setupStep !== 'ready' && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-6 bg-[#050a16] pointer-events-auto"
          style={{ animation: 'fadeIn 0.5s ease' }}>
          
          {/* Background visuals */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
          </div>

          <div className="relative glass-panel-strong rounded-[40px] p-12 max-w-xl w-full shadow-2xl border-white/10 text-center">
            
            {/* Icon Stage */}
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-neon to-blue-500 flex items-center justify-center shadow-[0_0_50px_rgba(0,245,212,0.3)] animate-bounce-slow">
                {setupStep === 'checking' && <Zap className="w-10 h-10 text-black animate-pulse" />}
                {setupStep === 'permissions' && <ShieldCheck className="w-10 h-10 text-black" />}
                {setupStep === 'installing' && <Settings2 className="w-10 h-10 text-black animate-spin-slow" />}
              </div>
            </div>

            <h2 className="text-3xl font-black text-white mb-4 tracking-tight">
              {setupStep === 'checking' && 'Inicializando...'}
              {setupStep === 'permissions' && 'Permisos Requeridos'}
              {setupStep === 'installing' && 'Optimizando Sistema'}
            </h2>

            <p className="text-slate-400 text-lg mb-10 leading-relaxed font-light">
              {setupStep === 'checking' && 'Neural Cursor está preparando el núcleo de procesamiento biométrico.'}
              {setupStep === 'permissions' && 'Para que el tracking funcione, necesitamos acceso a la cámara y control del sistema.'}
              {setupStep === 'installing' && 'Estamos configurando los módulos de inteligencia artificial en segundo plano.'}
            </p>

            {/* Progress / Action */}
            <div className="space-y-4">
              {setupStep === 'permissions' ? (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={async () => {
                        const granted = await electronAPI.requestCamera();
                        if (!granted) electronAPI.openCameraSettings();
                      }}
                      className={`flex flex-col items-center justify-center p-6 rounded-3xl border transition-all duration-300 group relative overflow-hidden ${cameraAllowed ? 'bg-neon/10 border-neon/40 shadow-[0_0_20px_rgba(0,245,212,0.1)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      {cameraAllowed && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-neon animate-pulse" />}
                      <div className="relative mb-3">
                        <Camera className={`w-10 h-10 transition-all duration-500 ${cameraAllowed ? 'text-neon drop-shadow-[0_0_8px_rgba(0,245,212,0.6)]' : 'text-slate-500 group-hover:scale-110'}`} />
                        {cameraAllowed && <div className="absolute -top-1 -right-1 w-5 h-5 bg-neon rounded-full flex items-center justify-center border-2 border-[#050a16] shadow-lg"><div className="w-2 h-1.5 border-b-2 border-r-2 border-black rotate-45 -mt-0.5" /></div>}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-widest mb-1 ${cameraAllowed ? 'text-neon' : 'text-slate-400'}`}>Cámara</span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.2em] ${cameraAllowed ? 'text-neon/60' : 'text-slate-600'}`}>
                        {cameraAllowed ? 'Cerebro Vinculado' : 'Acceso Requerido'}
                      </span>
                    </button>
                    
                    <button
                      onClick={() => electronAPI.openAccessibility()}
                      className={`flex flex-col items-center justify-center p-6 rounded-3xl border transition-all duration-300 group relative overflow-hidden ${accessibilityAllowed ? 'bg-neon/10 border-neon/40 shadow-[0_0_20px_rgba(0,245,212,0.1)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      {accessibilityAllowed && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-neon animate-pulse" />}
                      <div className="relative mb-3">
                        <ShieldCheck className={`w-10 h-10 transition-all duration-500 ${accessibilityAllowed ? 'text-neon drop-shadow-[0_0_8px_rgba(0,245,212,0.6)]' : 'text-slate-500 group-hover:scale-110'}`} />
                        {accessibilityAllowed && <div className="absolute -top-1 -right-1 w-5 h-5 bg-neon rounded-full flex items-center justify-center border-2 border-[#050a16] shadow-lg"><div className="w-2 h-1.5 border-b-2 border-r-2 border-black rotate-45 -mt-0.5" /></div>}
                      </div>
                      <span className={`text-xs font-black uppercase tracking-widest mb-1 ${accessibilityAllowed ? 'text-neon' : 'text-slate-400'}`}>Accesibilidad</span>
                      <span className={`text-[8px] font-bold uppercase tracking-[0.2em] ${accessibilityAllowed ? 'text-neon/60' : 'text-slate-600'}`}>
                        {accessibilityAllowed ? 'Control Activo' : 'Acceso Requerido'}
                      </span>
                    </button>
                  </div>
                  
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-[10px] text-slate-400 leading-relaxed space-y-3">
                    <p className="flex items-start gap-3">
                      <span className="text-neon mt-0.5">ℹ</span>
                      <span>Si el botón no activa el mensaje del sistema o ya habías denegado el permiso antes, se abrirán los **Ajustes de Privacidad** para que puedas activarlo manualmente.</span>
                    </p>
                    
                    {!accessibilityAllowed && (
                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <p className="font-bold text-rose-400 flex items-center gap-2">
                          <Info className="w-3 h-3" />
                          <span>¿Problemas con la Accesibilidad?</span>
                        </p>
                        <p>Si ya activaste el permiso pero la app NO lo detecta, intenta esto:</p>
                        <ol className="list-decimal list-inside space-y-1 ml-1">
                          <li>Desactiva y vuelve a activar el switch en Ajustes.</li>
                          <li>Si eso falla, usa el botón de abajo para forzar un reinicio.</li>
                        </ol>
                        <button
                          onClick={async () => {
                            const ok = await (window as any).electronAPI.resetAccessibilityPermissions();
                            if (ok) {
                              alert("Permisos reiniciados. Neural Cursor desaparecerá de la lista. Por favor, pulsa 'Accesibilidad' de nuevo para volver a añadirlo.");
                            }
                          }}
                          className="w-full py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold uppercase tracking-wider hover:bg-rose-500/20 transition-all"
                        >
                          Reiniciar Permisos de Accesibilidad
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={handleGrantPermissions}
                    className="w-full py-5 rounded-2xl bg-neon text-black font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_30px_rgba(0,245,212,0.4)] hover:scale-[1.02] active:scale-95 transition-all mt-2"
                  >
                    Confirmar y Entrar →
                  </button>
                  
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest animate-pulse mt-2 text-center">
                    La aplicación detectará los permisos automáticamente.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-neon animate-progress-indefinite shadow-[0_0_10px_#00f5d4]" />
                  </div>
                  <span className="text-neon font-mono text-[11px] uppercase tracking-[0.3em] animate-pulse">
                    {installMessage}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-center gap-8 opacity-40">
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                 <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Silent OS Integration</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                 <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AES-256 Encrypted</span>
               </div>
            </div>
          </div>
        </div>
      )}
      {/* Interaction Guide Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={closeOnboarding} />
          
          <div className="relative glass-panel-strong w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 animate-slide-in-top">
            {/* Header */}
            <div className="p-8 sm:p-10 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-[0.2em] text-neon">Guía de Interacción</h2>
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-[0.3em] mt-2">Neural Cursor x macOS Integration</p>
              </div>
              <button 
                onClick={closeOnboarding}
                className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
              >
                <X className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 sm:p-10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Step 1: Movement */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-neon/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <MousePointer2 className="w-6 h-6 text-neon" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-3">Movimiento Fluido</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Mueve el **dedo índice** para desplazar el cursor por toda la pantalla de tu Mac, incluso fuera de esta ventana.
                  </p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neon/80">Control Global Activado</span>
                  </div>
                </div>

                {/* Step 2: Left Click */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-neon/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Target className="w-6 h-6 text-neon" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-3">Click Izquierdo</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Junta rápidamente el **pulgar y el dedo índice** (gesto de pinza). Es ideal para seleccionar y abrir aplicaciones.
                  </p>
                </div>

                {/* Step 3: Right Click */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-blue-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Settings2 className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-3">Click Derecho</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Junta el **pulgar con el dedo corazón** para abrir menús contextuales en cualquier parte del sistema.
                  </p>
                </div>

                {/* Step 4: Scroll */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-amber-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <MousePointer2 className="w-6 h-6 text-amber-400 rotate-90" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-amber-400 mb-3">Desplazamiento</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Junta el **pulgar con el dedo anular** y mueve la mano hacia arriba o abajo para hacer scroll en páginas web y documentos.
                  </p>
                </div>
              </div>

              {/* Pro Tip */}
              <div className="mt-10 p-6 rounded-3xl bg-neon/5 border border-neon/20 flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center flex-shrink-0 border border-neon/30">
                  <Zap className="w-7 h-7 text-neon" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-neon">Consejo de Pro</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    Para mayor precisión, puedes ajustar la **Sensibilidad** y el **Suavizado** en el panel de Ajustes. El sistema funciona mejor con buena iluminación.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 sm:p-10 bg-black/20 border-t border-white/5">
              <button 
                onClick={closeOnboarding}
                className="w-full py-5 rounded-2xl bg-neon text-black font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_40px_rgba(0,245,212,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
              >
                Entendido, ¡Empezar a Controlar!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
