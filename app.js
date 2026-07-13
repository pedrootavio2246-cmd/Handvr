// HandFusion VR v0.5 — Google panel, two hands and lightweight 3DoF
// MediaPipe is imported only after the user presses Start.
// This keeps the interface alive and shows a useful error if the CDN fails.

let FilesetResolver = null;
let HandLandmarker = null;

const MEDIAPIPE_VERSION = "0.10.35";
const MEDIAPIPE_MODULE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`;
const MEDIAPIPE_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

async function loadMediaPipe() {
  if (FilesetResolver && HandLandmarker) return;

  setStatus("Baixando o rastreamento de mãos...");

  try {
    const module = await import(MEDIAPIPE_MODULE_URL);
    FilesetResolver = module.FilesetResolver;
    HandLandmarker = module.HandLandmarker;

    if (!FilesetResolver || !HandLandmarker) {
      throw new Error("O módulo carregou, mas não trouxe o Hand Landmarker.");
    }
  } catch (error) {
    console.error("Falha ao carregar MediaPipe:", error);
    throw new Error(
      "Não consegui carregar o MediaPipe. Verifique a internet e recarregue a página."
    );
  }
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

const startPanel = document.querySelector("#startPanel");
const startButton = document.querySelector("#startButton");
const bootStatus = document.querySelector("#bootStatus");
const hud = document.querySelector("#hud");
const controls = document.querySelector("#controls");
const showControlsButton = document.querySelector("#showControlsButton");
const hideControlsButton = document.querySelector("#hideControlsButton");
const vrButton = document.querySelector("#vrButton");
const objectsButton = document.querySelector("#objectsButton");
const cameraButton = document.querySelector("#cameraButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const smoothingInput = document.querySelector("#smoothing");
const eyeSeparationInput = document.querySelector("#eyeSeparation");
const fpsLabel = document.querySelector("#fps");
const handsLabel = document.querySelector("#hands");
const gestureLabel = document.querySelector("#gesture");
const rotateNotice = document.querySelector("#rotateNotice");

const spatialLayer = document.querySelector("#spatialLayer");
const screenSingle = document.querySelector("#screenSingle");
const screenLeft = document.querySelector("#screenLeft");
const screenRight = document.querySelector("#screenRight");
const cursorSingle = document.querySelector("#cursorSingle");
const cursorLeft = document.querySelector("#cursorLeft");
const cursorRight = document.querySelector("#cursorRight");

const screenPanel = document.querySelector("#screenPanel");
const screenButton = document.querySelector("#screenButton");
const screenVisibilityButton = document.querySelector("#screenVisibilityButton");
const youtubeUrlInput = document.querySelector("#youtubeUrl");
const loadYoutubeButton = document.querySelector("#loadYoutubeButton");
const playYoutubeButton = document.querySelector("#playYoutubeButton");
const pauseYoutubeButton = document.querySelector("#pauseYoutubeButton");
const centerScreenButton = document.querySelector("#centerScreenButton");
const hideScreenButton = document.querySelector("#hideScreenButton");
const closeScreenPanelButton = document.querySelector("#closeScreenPanelButton");
const screenSizeInput = document.querySelector("#screenSize");
const screenStatus = document.querySelector("#screenStatus");
const performancePreset = document.querySelector("#performancePreset");
const performanceButton = document.querySelector("#performanceButton");
const skeletonButton = document.querySelector("#skeletonButton");
const browserButton = document.querySelector("#browserButton");
const keyboardToggleButton = document.querySelector("#keyboardToggleButton");
const recenterButton = document.querySelector("#recenterButton");


let handLandmarker = null;
let stream = null;
let facingMode = "environment";
let vrMode = true;
let objectsEnabled = false;
let running = false;
let lastVideoTime = -1;
let lastFrameTimestamp = performance.now();
let fpsAverage = 0;
let lastResults = null;
let wakeLock = null;

const IS_ANDROID = /Android/i.test(navigator.userAgent);
const PERFORMANCE_PROFILES = {
  lite: {
    label: "Leve",
    canvasScale: 0.62,
    cameraWidth: 640,
    cameraHeight: 360,
    cameraFps: 20,
    trackingFps: 9,
    renderFps: 30,
    numHands: 2,
    fullLandmarkDots: false,
    shadows: false
  },
  balanced: {
    label: "Equilibrado",
    canvasScale: 0.82,
    cameraWidth: 854,
    cameraHeight: 480,
    cameraFps: 24,
    trackingFps: 14,
    renderFps: 40,
    numHands: 2,
    fullLandmarkDots: false,
    shadows: false
  },
  quality: {
    label: "Qualidade",
    canvasScale: Math.min(window.devicePixelRatio || 1, 1.15),
    cameraWidth: 1280,
    cameraHeight: 720,
    cameraFps: 30,
    trackingFps: 20,
    renderFps: 55,
    numHands: 2,
    fullLandmarkDots: true,
    shadows: true
  }
};

let performanceMode = IS_ANDROID ? "lite" : "balanced";
let skeletonEnabled = !IS_ANDROID;
let preparedHands = [];
let lastInferenceAt = 0;
let lastRenderAt = 0;
let lastHudAt = 0;
let spatialLayoutDirty = true;
let profileChanging = false;

let browserVisible = true;
let keyboardVisible = false;
let browserQuery = localStorage.getItem("hf_browser_query") || "";
let browserSuggestions = [];
let suggestionTimer = null;
let activeSearchMode = "google";
let lastUiClickAt = 0;

const browserPanel = {
  x: 0.47,
  y: 0.31,
  width: 0.70,
  height: 0.43
};

const uiHandStates = new Map();
let browserDrag = null;

const KEYBOARD_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
  ["FECHAR","ESPAÇO","BUSCAR"]
];

const orientationState = {
  permission: "unknown",
  received: false,
  alpha: 0,
  beta: 0,
  gamma: 0,
  baseAlpha: null,
  baseBeta: null,
  baseGamma: null
};


let screenVisible = false;
let screenHasVideo = false;
let screenGrabbedBy = null;
let screenGrabOffset = { x: 0, y: 0 };
let lastSpatialPointer = null;
let youtubeApiPromise = null;
let youtubePlayers = {};
let youtubeSyncTimer = null;

const spatialScreenState = {
  x: 0.5,
  y: 0.46,
  width: 0.64,
  videoId: null
};


const smoothedByHand = new Map();
const grabbedByHand = new Map();

const labObjects = [
  { x: 0.34, y: 0.43, radius: 0.045, shape: "circle" },
  { x: 0.51, y: 0.60, radius: 0.050, shape: "square" },
  { x: 0.69, y: 0.39, radius: 0.042, shape: "triangle" }
];

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]
];

function setStatus(message) {
  bootStatus.textContent = message;
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function currentProfile() {
  return PERFORMANCE_PROFILES[performanceMode];
}

function resizeCanvas() {
  const scale = currentProfile().canvasScale;
  const width = Math.max(1, Math.floor(window.innerWidth * scale));
  const height = Math.max(1, Math.floor(window.innerHeight * scale));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const portrait = window.innerHeight > window.innerWidth;
  rotateNotice.classList.toggle("hidden", !portrait || !running);
  spatialLayoutDirty = true;
}

function updatePerformanceUi() {
  const profile = currentProfile();
  performancePreset.value = performanceMode;
  performanceButton.textContent = `Desempenho: ${profile.label}`;
  document.body.classList.toggle("performance-lite", performanceMode === "lite");
  document.body.classList.toggle("browser-active", browserVisible);
}

async function applyPerformanceMode(mode, restart = false) {
  if (!PERFORMANCE_PROFILES[mode] || profileChanging) return;

  performanceMode = mode;
  updatePerformanceUi();
  resizeCanvas();

  if (!running || !restart) return;

  profileChanging = true;
  gestureLabel.textContent = "Otimizando...";
  try {
    await createLandmarker();
    await startCamera();
    smoothedByHand.clear();
    preparedHands = [];
    gestureLabel.textContent = `Modo ${currentProfile().label}`;
  } catch (error) {
    console.error("Falha ao mudar desempenho:", error);
    gestureLabel.textContent = "Erro ao mudar desempenho";
  } finally {
    profileChanging = false;
  }
}

function coverSourceRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const sw = sourceHeight * targetAspect;
    return {
      sx: (sourceWidth - sw) / 2,
      sy: 0,
      sw,
      sh: sourceHeight
    };
  }

  const sh = sourceWidth / targetAspect;
  return {
    sx: 0,
    sy: (sourceHeight - sh) / 2,
    sw: sourceWidth,
    sh
  };
}

function smoothLandmarks(label, landmarks) {
  const smoothing = Number(smoothingInput.value);
  const previous = smoothedByHand.get(label);

  if (!previous || previous.length !== landmarks.length) {
    const fresh = landmarks.map((point) => ({ ...point }));
    smoothedByHand.set(label, fresh);
    return fresh;
  }

  const next = landmarks.map((point, index) => {
    const old = previous[index];
    return {
      x: old.x * smoothing + point.x * (1 - smoothing),
      y: old.y * smoothing + point.y * (1 - smoothing),
      z: old.z * smoothing + point.z * (1 - smoothing)
    };
  });

  smoothedByHand.set(label, next);
  return next;
}

function fingerExtended(points, tip, pip) {
  const wrist = points[0];
  return distance2D(wrist, points[tip]) > distance2D(wrist, points[pip]) * 1.12;
}

function detectGesture(points) {
  const palmSize = Math.max(distance2D(points[0], points[9]), 0.001);
  const pinchRatio = distance2D(points[4], points[8]) / palmSize;

  const indexExtended = fingerExtended(points, 8, 6);
  const middleExtended = fingerExtended(points, 12, 10);
  const ringExtended = fingerExtended(points, 16, 14);
  const pinkyExtended = fingerExtended(points, 20, 18);

  const extended = [
    indexExtended,
    middleExtended,
    ringExtended,
    pinkyExtended
  ].filter(Boolean).length;

  const pinching = pinchRatio < 0.34;
  const okSign =
    pinchRatio < 0.31 &&
    !middleExtended &&
    !ringExtended &&
    !pinkyExtended;

  if (okSign) {
    return {
      name: "OK",
      pinching: true,
      okSign: true,
      pinchRatio
    };
  }
  if (pinching) {
    return {
      name: "Pinça",
      pinching: true,
      okSign: false,
      pinchRatio
    };
  }
  if (extended >= 4) {
    return {
      name: "Mão aberta",
      pinching: false,
      okSign: false,
      pinchRatio
    };
  }
  if (extended <= 1) {
    return {
      name: "Punho",
      pinching: false,
      okSign: false,
      pinchRatio
    };
  }
  if (indexExtended && extended <= 2) {
    return {
      name: "Apontando",
      pinching: false,
      okSign: false,
      pinchRatio
    };
  }
  return {
    name: "Rastreando",
    pinching: false,
    okSign: false,
    pinchRatio
  };
}

function getHandLabel(results, index) {
  const item = results?.handedness?.[index]?.[0];
  return item?.categoryName || `Mão ${index + 1}`;
}

function projectLandmark(point, eyeX, eyeWidth, eyeHeight, eyeSign) {
  const depthShift = Number(eyeSeparationInput.value) * eyeSign * (-point.z * 2.2);
  return {
    x: eyeX + point.x * eyeWidth + depthShift,
    y: point.y * eyeHeight
  };
}

function drawCameraEye(eyeX, eyeWidth, eyeHeight) {
  if (!video.videoWidth || !video.videoHeight) {
    ctx.fillStyle = "#05070d";
    ctx.fillRect(eyeX, 0, eyeWidth, eyeHeight);
    return;
  }

  const rect = coverSourceRect(
    video.videoWidth,
    video.videoHeight,
    eyeWidth,
    eyeHeight
  );

  ctx.drawImage(
    video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    eyeX,
    0,
    eyeWidth,
    eyeHeight
  );

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(eyeX, 0, eyeWidth, eyeHeight);
}

function drawLabObjects(eyeX, eyeWidth, eyeHeight, eyeSign) {
  if (!objectsEnabled) return;

  for (const object of labObjects) {
    const parallax = eyeSign * Number(eyeSeparationInput.value) * 0.35;
    const x = eyeX + object.x * eyeWidth + parallax;
    const y = object.y * eyeHeight;
    const radius = object.radius * Math.min(eyeWidth, eyeHeight);

    ctx.save();
    ctx.lineWidth = Math.max(2, eyeWidth * 0.004);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.fillStyle = "rgba(30, 210, 255, 0.28)";
    if (currentProfile().shadows) {
      ctx.shadowBlur = radius * 0.7;
      ctx.shadowColor = "rgba(30, 210, 255, 0.7)";
    }

    ctx.beginPath();
    if (object.shape === "circle") {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    } else if (object.shape === "square") {
      ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y + radius);
      ctx.lineTo(x - radius, y + radius);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawHand(points, label, gesture, eyeX, eyeWidth, eyeHeight, eyeSign) {
  if (!skeletonEnabled) return;

  const projected = points.map((point) =>
    projectLandmark(point, eyeX, eyeWidth, eyeHeight, eyeSign)
  );

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle =
    label.toLowerCase().includes("left")
      ? "rgba(121, 255, 184, 0.95)"
      : "rgba(110, 196, 255, 0.95)";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = Math.max(1.5, eyeWidth * 0.005);

  if (currentProfile().shadows) {
    ctx.shadowBlur = 7;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
  }

  ctx.beginPath();
  for (const [start, end] of HAND_CONNECTIONS) {
    ctx.moveTo(projected[start].x, projected[start].y);
    ctx.lineTo(projected[end].x, projected[end].y);
  }
  ctx.stroke();

  const dotRadius = Math.max(1.8, eyeWidth * 0.006);
  const pointIndexes = currentProfile().fullLandmarkDots
    ? projected.map((_, index) => index)
    : [0, 4, 8, 12, 16, 20];

  for (const index of pointIndexes) {
    const point = projected[index];
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      index === 4 || index === 8 ? dotRadius * 1.4 : dotRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  if (gesture.pinching) {
    const pinchX = (projected[4].x + projected[8].x) / 2;
    const pinchY = (projected[4].y + projected[8].y) / 2;
    ctx.strokeStyle = "rgba(255, 235, 92, 1)";
    ctx.lineWidth = Math.max(2.5, eyeWidth * 0.008);
    ctx.beginPath();
    ctx.arc(pinchX, pinchY, dotRadius * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function interactWithObjects(handKey, points, gesture) {
  if (!objectsEnabled) return;

  const pinch = {
    x: (points[4].x + points[8].x) / 2,
    y: (points[4].y + points[8].y) / 2
  };

  if (!gesture.pinching) {
    grabbedByHand.delete(handKey);
    return;
  }

  let grabbedIndex = grabbedByHand.get(handKey);

  if (grabbedIndex === undefined) {
    let nearest = -1;
    let nearestDistance = Infinity;

    labObjects.forEach((object, index) => {
      const distance = Math.hypot(pinch.x - object.x, pinch.y - object.y);
      if (distance < object.radius * 1.8 && distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });

    if (nearest >= 0) {
      grabbedByHand.set(handKey, nearest);
      grabbedIndex = nearest;
    }
  }

  if (grabbedIndex !== undefined) {
    const object = labObjects[grabbedIndex];
    object.x = Math.min(0.95, Math.max(0.05, pinch.x));
    object.y = Math.min(0.93, Math.max(0.07, pinch.y));
  }
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseYouTubeVideoId(value) {
  const input = String(value || "").trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id || "") ? id : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      const watchId = url.searchParams.get("v");
      if (/^[a-zA-Z0-9_-]{11}$/.test(watchId || "")) {
        return watchId;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const typeIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live"].includes(part)
      );
      const pathId = typeIndex >= 0 ? parts[typeIndex + 1] : null;
      return /^[a-zA-Z0-9_-]{11}$/.test(pathId || "") ? pathId : null;
    }
  } catch {
    return null;
  }

  return null;
}

function setScreenStatus(message) {
  screenStatus.textContent = message;
}

function showSpatialScreen(visible = true) {
  screenVisible = visible;
  spatialLayer.classList.toggle("hidden", !visible);
  screenVisibilityButton.textContent = `Tela: ${visible ? "ON" : "OFF"}`;

  if (!visible) {
    screenGrabbedBy = null;
    [screenSingle, screenLeft, screenRight].forEach((element) =>
      element.classList.remove("grabbed")
    );
  }

  spatialLayoutDirty = true;
}

function updateSpatialLayout() {
  if (!screenVisible) {
    spatialLayoutDirty = false;
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const eyeWidth = vrMode ? viewportWidth / 2 : viewportWidth;

  const screenWidth = spatialScreenState.width * eyeWidth;
  const screenHeight = screenWidth * (9 / 16) + 28;
  const halfWidthNorm = spatialScreenState.width / 2;
  const halfHeightNorm = screenHeight / (2 * viewportHeight);

  spatialScreenState.x = clamp(
    spatialScreenState.x,
    halfWidthNorm,
    1 - halfWidthNorm
  );
  spatialScreenState.y = clamp(
    spatialScreenState.y,
    halfHeightNorm,
    1 - halfHeightNorm
  );

  const apply = (element, eyeIndex, localEyeWidth) => {
    const eyeOffset = eyeIndex * localEyeWidth;
    element.style.width = `${spatialScreenState.width * localEyeWidth}px`;
    element.style.left = `${
      eyeOffset + spatialScreenState.x * localEyeWidth
    }px`;
    element.style.top = `${spatialScreenState.y * viewportHeight}px`;
  };

  screenSingle.classList.add("hidden");

  if (vrMode) {
    screenLeft.classList.remove("hidden");
    screenRight.classList.remove("hidden");
    apply(screenLeft, 0, viewportWidth / 2);
    apply(screenRight, 1, viewportWidth / 2);
  } else {
    screenLeft.classList.remove("hidden");
    screenRight.classList.add("hidden");
    apply(screenLeft, 0, viewportWidth);
  }

  spatialLayoutDirty = false;
}
function spatialScreenNormalizedHeight() {
  const eyeWidth = vrMode ? window.innerWidth / 2 : window.innerWidth;
  const pixelHeight =
    spatialScreenState.width * eyeWidth * (9 / 16) + 28;
  return pixelHeight / Math.max(window.innerHeight, 1);
}

function isInsideSpatialScreen(point) {
  const halfWidth = spatialScreenState.width / 2;
  const halfHeight = spatialScreenNormalizedHeight() / 2;

  return (
    Math.abs(point.x - spatialScreenState.x) <= halfWidth &&
    Math.abs(point.y - spatialScreenState.y) <= halfHeight
  );
}

function interactWithSpatialScreen(handKey, points, gesture) {
  if (!screenVisible) {
    if (screenGrabbedBy === handKey) screenGrabbedBy = null;
    return false;
  }

  const pinchPoint = {
    x: (points[4].x + points[8].x) / 2,
    y: (points[4].y + points[8].y) / 2
  };
  lastSpatialPointer = { ...pinchPoint, pinching: gesture.pinching };

  if (!gesture.pinching) {
    if (screenGrabbedBy === handKey) {
      screenGrabbedBy = null;
      [screenSingle, screenLeft, screenRight].forEach((element) =>
        element.classList.remove("grabbed")
      );
    }
    return false;
  }

  if (!screenGrabbedBy && isInsideSpatialScreen(pinchPoint)) {
    screenGrabbedBy = handKey;
    screenGrabOffset = {
      x: pinchPoint.x - spatialScreenState.x,
      y: pinchPoint.y - spatialScreenState.y
    };

    [screenSingle, screenLeft, screenRight].forEach((element) =>
      element.classList.add("grabbed")
    );
  }

  if (screenGrabbedBy === handKey) {
    const halfWidth = spatialScreenState.width / 2;
    const halfHeight = spatialScreenNormalizedHeight() / 2;

    spatialScreenState.x = clamp(
      pinchPoint.x - screenGrabOffset.x,
      halfWidth,
      1 - halfWidth
    );
    spatialScreenState.y = clamp(
      pinchPoint.y - screenGrabOffset.y,
      halfHeight,
      1 - halfHeight
    );
    spatialLayoutDirty = true;
    return true;
  }

  return false;
}

function updateSpatialCursors(hands) {
  const cursors = [cursorSingle, cursorLeft, cursorRight];

  if (!screenVisible || !hands?.length) {
    cursors.forEach((cursor) => cursor.classList.add("hidden"));
    return;
  }

  const hand = hands[0];
  const points = hand.points;
  const gesture = hand.gesture;
  const point = {
    x: (points[4].x + points[8].x) / 2,
    y: (points[4].y + points[8].y) / 2
  };

  const placeCursor = (cursor, eyeIndex, eyeWidth) => {
    cursor.classList.remove("hidden");
    cursor.classList.toggle("pinching", gesture.pinching);
    cursor.style.left = `${eyeIndex * eyeWidth + point.x * eyeWidth}px`;
    cursor.style.top = `${point.y * window.innerHeight}px`;
  };

  cursorSingle.classList.add("hidden");

  if (vrMode) {
    placeCursor(cursorLeft, 0, window.innerWidth / 2);
    placeCursor(cursorRight, 1, window.innerWidth / 2);
  } else {
    cursorRight.classList.add("hidden");
    placeCursor(cursorLeft, 0, window.innerWidth);
  }
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      try {
        previousReady?.();
      } finally {
        resolve(window.YT);
      }
    };

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () =>
        reject(new Error("Não consegui carregar o player do YouTube."));
      document.head.appendChild(script);
    }

    window.setTimeout(() => {
      if (!window.YT?.Player) {
        reject(
          new Error(
            "O YouTube demorou demais para carregar. Verifique a internet."
          )
        );
      }
    }, 15000);
  });

  return youtubeApiPromise;
}

function replacePlayerSlot(slotId, childId) {
  const slot = document.getElementById(slotId);
  slot.replaceChildren();
  const child = document.createElement("div");
  child.id = childId;
  slot.appendChild(child);
}

function destroyYouTubePlayers() {
  Object.values(youtubePlayers).forEach((player) => {
    try {
      player?.destroy?.();
    } catch (error) {
      console.warn("Falha ao destruir player:", error);
    }
  });
  youtubePlayers = {};

  if (youtubeSyncTimer) {
    window.clearInterval(youtubeSyncTimer);
    youtubeSyncTimer = null;
  }
}

function playerOptions(videoId, muted = false) {
  return {
    videoId,
    playerVars: {
      playsinline: 1,
      controls: 0,
      rel: 0,
      fs: 0,
      disablekb: 1,
      enablejsapi: 1,
      origin: window.location.origin
    },
    events: {
      onReady(event) {
        if (muted) event.target.mute();
      },
      onError(event) {
        setScreenStatus(`O YouTube retornou o erro ${event.data}.`);
      }
    }
  };
}

async function createYouTubePlayers(videoId) {
  setScreenStatus("Carregando player do YouTube...");
  await loadYouTubeApi();
  destroyYouTubePlayers();

  replacePlayerSlot("ytLeft", "ytLeftPlayer");
  replacePlayerSlot("ytRight", "ytRightPlayer");

  youtubePlayers.left = new window.YT.Player(
    "ytLeftPlayer",
    playerOptions(videoId, false)
  );
  youtubePlayers.right = new window.YT.Player(
    "ytRightPlayer",
    playerOptions(videoId, true)
  );

  spatialScreenState.videoId = videoId;
  screenHasVideo = true;
  showSpatialScreen(true);
  updateYoutubeAudioMode();
  setScreenStatus("Vídeo carregado. Toque em Reproduzir.");

  youtubeSyncTimer = window.setInterval(syncYouTubePlayers, 1500);
}

function getPlayerState(player) {
  try {
    return player?.getPlayerState?.();
  } catch {
    return null;
  }
}

function getCurrentTime(player) {
  try {
    return Number(player?.getCurrentTime?.() || 0);
  } catch {
    return 0;
  }
}

function updateYoutubeAudioMode() {
  try {
    youtubePlayers.left?.unMute?.();
    youtubePlayers.right?.mute?.();

    if (!vrMode) {
      youtubePlayers.right?.pauseVideo?.();
    }
  } catch (error) {
    console.warn("Não foi possível ajustar o áudio:", error);
  }
}

function syncYouTubePlayers() {
  if (!screenHasVideo || !vrMode) return;

  const master = youtubePlayers.left;
  const follower = youtubePlayers.right;
  if (!master || !follower) return;

  const masterTime = getCurrentTime(master);
  const masterState = getPlayerState(master);

  try {
    if (Math.abs(getCurrentTime(follower) - masterTime) > 0.8) {
      follower.seekTo(masterTime, true);
    }

    if (masterState === 1 && getPlayerState(follower) !== 1) {
      follower.playVideo();
    } else if (masterState !== 1 && getPlayerState(follower) === 1) {
      follower.pauseVideo();
    }
  } catch {
    // O player pode ainda não estar pronto.
  }
}

function playYouTube() {
  if (!screenHasVideo) {
    setScreenStatus("Primeiro cole um link e carregue o vídeo.");
    return;
  }

  try {
    youtubePlayers.left?.playVideo?.();
    if (vrMode) {
      youtubePlayers.right?.playVideo?.();
    } else {
      youtubePlayers.right?.pauseVideo?.();
    }
    updateYoutubeAudioMode();
    setScreenStatus("Reproduzindo.");
  } catch (error) {
    console.error(error);
    setScreenStatus("O player ainda está carregando. Tente novamente.");
  }
}

function pauseYouTube() {
  try {
    youtubePlayers.left?.pauseVideo?.();
    youtubePlayers.right?.pauseVideo?.();
    setScreenStatus("Pausado.");
  } catch (error) {
    console.error(error);
  }
}

function prepareHands(results) {
  if (!results?.landmarks?.length) return [];

  return results.landmarks.map((rawPoints, index) => {
    const label = getHandLabel(results, index);
    const handKey = `${label}-${index}`;
    const points = smoothLandmarks(handKey, rawPoints);
    return {
      label,
      handKey,
      points,
      gesture: detectGesture(points)
    };
  });
}


function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function wrapAngleDifference(value, base) {
  let difference = value - base;
  while (difference > 180) difference -= 360;
  while (difference < -180) difference += 360;
  return difference;
}

function getSpatialOffset() {
  if (
    !orientationState.received ||
    orientationState.baseAlpha === null ||
    orientationState.baseBeta === null
  ) {
    return { x: 0, y: 0 };
  }

  const yaw = wrapAngleDifference(
    orientationState.alpha,
    orientationState.baseAlpha
  );
  const pitch = orientationState.beta - orientationState.baseBeta;

  return {
    x: clamp(-yaw / 95, -0.20, 0.20),
    y: clamp(pitch / 100, -0.14, 0.14)
  };
}

function recenterSpatialUi() {
  if (orientationState.received) {
    orientationState.baseAlpha = orientationState.alpha;
    orientationState.baseBeta = orientationState.beta;
    orientationState.baseGamma = orientationState.gamma;
  }
  browserPanel.x = 0.47;
  browserPanel.y = 0.31;
}

async function requestOrientationTracking() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const result = await DeviceOrientationEvent.requestPermission();
      orientationState.permission = result;
      return result === "granted";
    }

    orientationState.permission = "granted";
    return true;
  } catch (error) {
    console.warn("Giroscópio indisponível:", error);
    orientationState.permission = "denied";
    return false;
  }
}

window.addEventListener("deviceorientation", (event) => {
  if (
    event.alpha === null ||
    event.beta === null ||
    event.gamma === null
  ) {
    return;
  }

  orientationState.received = true;
  orientationState.alpha = event.alpha;
  orientationState.beta = event.beta;
  orientationState.gamma = event.gamma;

  if (orientationState.baseAlpha === null) {
    recenterSpatialUi();
  }
}, { passive: true });

function getBrowserLayout() {
  const offset = getSpatialOffset();
  const panel = {
    x: browserPanel.x + offset.x - browserPanel.width / 2,
    y: browserPanel.y + offset.y - browserPanel.height / 2,
    width: browserPanel.width,
    height: browserPanel.height
  };

  panel.x = clamp(panel.x, 0.02, 0.98 - panel.width);
  panel.y = clamp(panel.y, 0.02, 0.96 - panel.height);

  const keyboard = {
    x: clamp(panel.x - 0.04, 0.02, 0.98 - 0.80),
    y: clamp(panel.y + panel.height + 0.025, 0.48, 0.98 - 0.34),
    width: 0.80,
    height: 0.34
  };

  let cubeX = panel.x + panel.width + 0.025;
  if (cubeX + 0.105 > 0.98) {
    cubeX = panel.x - 0.13;
  }

  const cube = {
    x: cubeX,
    y: panel.y + 0.045,
    width: 0.105,
    height: 0.13
  };

  return { panel, keyboard, cube };
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getKeyboardKeyRegions(layout) {
  const regions = [];
  const paddingX = 0.018;
  const paddingY = 0.022;
  const rowGap = 0.012;
  const rowHeight =
    (layout.height - paddingY * 2 - rowGap * (KEYBOARD_ROWS.length - 1)) /
    KEYBOARD_ROWS.length;

  KEYBOARD_ROWS.forEach((row, rowIndex) => {
    const y = layout.y + paddingY + rowIndex * (rowHeight + rowGap);
    const weights = row.map((key) => {
      if (key === "ESPAÇO") return 3.2;
      if (key === "BUSCAR") return 2.0;
      if (key === "FECHAR") return 1.8;
      return 1;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const keyGap = 0.008;
    const available =
      layout.width - paddingX * 2 - keyGap * (row.length - 1);
    let x = layout.x + paddingX;

    row.forEach((key, keyIndex) => {
      const width = available * (weights[keyIndex] / totalWeight);
      regions.push({
        id: `key:${key}`,
        key,
        x,
        y,
        width,
        height: rowHeight
      });
      x += width + keyGap;
    });
  });

  return regions;
}

function getBrowserRegions() {
  const layout = getBrowserLayout();
  const panel = layout.panel;
  const headerHeight = 0.065;
  const searchRect = {
    id: "search-field",
    x: panel.x + 0.045,
    y: panel.y + 0.10,
    width: panel.width - 0.09,
    height: 0.09
  };

  const buttonY = panel.y + 0.215;
  const buttonGap = 0.018;
  const buttonWidth = (panel.width - 0.09 - buttonGap * 2) / 3;
  const buttons = [
    {
      id: "search-google",
      x: panel.x + 0.045,
      y: buttonY,
      width: buttonWidth,
      height: 0.07
    },
    {
      id: "search-images",
      x: panel.x + 0.045 + buttonWidth + buttonGap,
      y: buttonY,
      width: buttonWidth,
      height: 0.07
    },
    {
      id: "search-youtube",
      x: panel.x + 0.045 + (buttonWidth + buttonGap) * 2,
      y: buttonY,
      width: buttonWidth,
      height: 0.07
    }
  ];

  const suggestionRegions = browserSuggestions.slice(0, 3).map((text, index) => ({
    id: `suggestion:${index}`,
    text,
    x: panel.x + 0.045,
    y: panel.y + 0.305 + index * 0.052,
    width: panel.width - 0.09,
    height: 0.045
  }));

  const regions = [
    {
      id: "panel-title",
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: headerHeight
    },
    searchRect,
    ...buttons,
    ...suggestionRegions,
    {
      id: "cube",
      ...layout.cube
    }
  ];

  if (keyboardVisible) {
    regions.push(...getKeyboardKeyRegions(layout.keyboard));
  }

  return { layout, regions };
}

function hitBrowserRegion(point) {
  const { regions } = getBrowserRegions();
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index];
    if (pointInRect(point, region)) return region;
  }
  return null;
}

function fitCanvasText(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `…${value.slice(-(maxChars - 1))}`;
}

function drawRoundedBox(context, rect, radius, fill, stroke = null, lineWidth = 1) {
  roundedRectPath(
    context,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    radius
  );
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function drawCube(context, rect, active) {
  const depth = Math.min(rect.width, rect.height) * 0.20;
  const front = {
    x: rect.x,
    y: rect.y + depth,
    width: rect.width - depth,
    height: rect.height - depth
  };

  context.save();

  drawRoundedBox(
    context,
    front,
    Math.min(front.width, front.height) * 0.16,
    active ? "rgba(210,236,255,0.98)" : "rgba(74,88,110,0.94)",
    "rgba(255,255,255,0.85)",
    Math.max(1, rect.width * 0.025)
  );

  context.beginPath();
  context.moveTo(front.x, front.y);
  context.lineTo(front.x + depth, rect.y);
  context.lineTo(rect.x + rect.width, rect.y);
  context.lineTo(front.x + front.width, front.y);
  context.closePath();
  context.fillStyle = active
    ? "rgba(163,213,255,0.95)"
    : "rgba(52,64,83,0.95)";
  context.fill();

  context.beginPath();
  context.moveTo(front.x + front.width, front.y);
  context.lineTo(rect.x + rect.width, rect.y);
  context.lineTo(rect.x + rect.width, rect.y + rect.height - depth);
  context.lineTo(front.x + front.width, front.y + front.height);
  context.closePath();
  context.fillStyle = active
    ? "rgba(117,184,240,0.95)"
    : "rgba(37,47,65,0.95)";
  context.fill();

  context.fillStyle = active ? "#0b1b2d" : "#f2f6ff";
  context.font = `800 ${Math.max(10, front.height * 0.38)}px system-ui`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    "⌂",
    front.x + front.width / 2,
    front.y + front.height / 2
  );

  context.restore();
}

function drawBrowserUiForEye(eyeX, eyeWidth, eyeHeight, eyeSign) {
  if (!browserVisible) return;

  const scaleX = eyeWidth;
  const scaleY = eyeHeight;
  const { layout } = getBrowserRegions();
  const panel = {
    x: eyeX + layout.panel.x * scaleX + eyeSign * 2,
    y: layout.panel.y * scaleY,
    width: layout.panel.width * scaleX,
    height: layout.panel.height * scaleY
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawRoundedBox(
    ctx,
    panel,
    Math.min(panel.width, panel.height) * 0.055,
    "rgba(246,248,252,0.96)",
    "rgba(200,216,235,0.96)",
    Math.max(1.5, eyeWidth * 0.004)
  );

  const titleRect = {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: 0.065 * scaleY
  };
  drawRoundedBox(
    ctx,
    titleRect,
    Math.min(titleRect.height * 0.45, panel.width * 0.04),
    "rgba(232,237,245,0.98)"
  );
  ctx.fillStyle = "#263345";
  ctx.font = `800 ${Math.max(11, eyeHeight * 0.030)}px system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "Google • HandFusion",
    titleRect.x + eyeWidth * 0.035,
    titleRect.y + titleRect.height / 2
  );

  ctx.fillStyle = "#4285F4";
  ctx.font = `900 ${Math.max(18, eyeHeight * 0.058)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(
    "Google",
    panel.x + panel.width / 2,
    panel.y + panel.height * 0.18
  );

  const searchRect = {
    x: panel.x + 0.045 * scaleX,
    y: panel.y + 0.10 * scaleY,
    width: panel.width - 0.09 * scaleX,
    height: 0.09 * scaleY
  };
  drawRoundedBox(
    ctx,
    searchRect,
    searchRect.height / 2,
    "rgba(255,255,255,0.98)",
    keyboardVisible
      ? "rgba(66,133,244,0.95)"
      : "rgba(185,195,210,0.95)",
    Math.max(1.2, eyeWidth * 0.004)
  );
  ctx.fillStyle = browserQuery ? "#202124" : "#7b8492";
  ctx.font = `600 ${Math.max(11, eyeHeight * 0.032)}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(
    browserQuery
      ? fitCanvasText(browserQuery, 28)
      : "Toque aqui e escreva com a mão",
    searchRect.x + searchRect.height * 0.34,
    searchRect.y + searchRect.height / 2
  );

  const { regions } = getBrowserRegions();
  const labels = {
    "search-google": "Pesquisar",
    "search-images": "Imagens",
    "search-youtube": "YouTube"
  };

  for (const region of regions) {
    if (!region.id.startsWith("search-") || region.id === "search-field") continue;
    const rect = {
      x: eyeX + region.x * scaleX,
      y: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY
    };
    drawRoundedBox(
      ctx,
      rect,
      rect.height / 2,
      region.id === `search-${activeSearchMode}`
        ? "rgba(66,133,244,0.98)"
        : "rgba(225,231,240,0.98)",
      "rgba(190,201,217,0.9)",
      Math.max(1, eyeWidth * 0.0025)
    );
    ctx.fillStyle =
      region.id === `search-${activeSearchMode}` ? "#fff" : "#263345";
    ctx.font = `800 ${Math.max(9, eyeHeight * 0.024)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(
      labels[region.id] || region.id,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2
    );
  }

  browserSuggestions.slice(0, 3).forEach((suggestion, index) => {
    const region = regions.find((item) => item.id === `suggestion:${index}`);
    if (!region) return;
    const rect = {
      x: eyeX + region.x * scaleX,
      y: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY
    };
    drawRoundedBox(
      ctx,
      rect,
      rect.height * 0.24,
      "rgba(239,243,249,0.96)"
    );
    ctx.fillStyle = "#364152";
    ctx.font = `600 ${Math.max(8, eyeHeight * 0.021)}px system-ui`;
    ctx.textAlign = "left";
    ctx.fillText(
      fitCanvasText(suggestion, 36),
      rect.x + eyeWidth * 0.018,
      rect.y + rect.height / 2
    );
  });

  if (!browserSuggestions.length) {
    ctx.fillStyle = "#6f7886";
    ctx.font = `600 ${Math.max(8, eyeHeight * 0.021)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(
      keyboardVisible
        ? "Aponte para uma tecla e faça uma pinça rápida."
        : "Faça o gesto OK por meio segundo para abrir o teclado.",
      panel.x + panel.width / 2,
      panel.y + panel.height * 0.79
    );
  }

  drawCube(
    ctx,
    {
      x: eyeX + layout.cube.x * scaleX,
      y: layout.cube.y * scaleY,
      width: layout.cube.width * scaleX,
      height: layout.cube.height * scaleY
    },
    browserVisible
  );

  if (keyboardVisible) {
    const keyboardRect = {
      x: eyeX + layout.keyboard.x * scaleX,
      y: layout.keyboard.y * scaleY,
      width: layout.keyboard.width * scaleX,
      height: layout.keyboard.height * scaleY
    };

    drawRoundedBox(
      ctx,
      keyboardRect,
      Math.min(keyboardRect.width, keyboardRect.height) * 0.08,
      "rgba(221,226,235,0.96)",
      "rgba(255,255,255,0.92)",
      Math.max(1.2, eyeWidth * 0.003)
    );

    for (const region of getKeyboardKeyRegions(layout.keyboard)) {
      const keyRect = {
        x: eyeX + region.x * scaleX,
        y: region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY
      };
      drawRoundedBox(
        ctx,
        keyRect,
        keyRect.height * 0.32,
        region.key === "BUSCAR"
          ? "rgba(66,133,244,0.98)"
          : "rgba(255,255,255,0.98)",
        "rgba(187,196,210,0.95)",
        Math.max(0.8, eyeWidth * 0.002)
      );
      ctx.fillStyle = region.key === "BUSCAR" ? "#fff" : "#202632";
      ctx.font = `800 ${Math.max(
        7,
        eyeHeight * (region.key.length > 2 ? 0.018 : 0.023)
      )}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(
        region.key,
        keyRect.x + keyRect.width / 2,
        keyRect.y + keyRect.height / 2
      );
    }
  }

  ctx.restore();
}

function drawBrowserPointerForEye(hand, eyeX, eyeWidth, eyeHeight) {
  if (!browserVisible) return;

  const point = hand.points[8];
  const x = eyeX + point.x * eyeWidth;
  const y = point.y * eyeHeight;
  const radius = Math.max(5, Math.min(eyeWidth, eyeHeight) * 0.018);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hand.label.toLowerCase().includes("left")
    ? "rgba(86,255,169,0.30)"
    : "rgba(80,180,255,0.30)";
  ctx.fill();
  ctx.lineWidth = Math.max(2, radius * 0.22);
  ctx.strokeStyle = hand.gesture.pinching
    ? "rgba(255,231,74,1)"
    : hand.label.toLowerCase().includes("left")
      ? "rgba(86,255,169,1)"
      : "rgba(80,180,255,1)";
  ctx.stroke();

  if (hand.gesture.okSign) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.55, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,231,74,0.75)";
    ctx.stroke();
  }
  ctx.restore();
}

function scheduleBrowserSuggestions() {
  localStorage.setItem("hf_browser_query", browserQuery);

  if (suggestionTimer) {
    clearTimeout(suggestionTimer);
  }

  const query = browserQuery.trim();
  if (query.length < 2) {
    browserSuggestions = [];
    return;
  }

  suggestionTimer = setTimeout(async () => {
    try {
      const response = await fetch(
        `/api/suggest?q=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      browserSuggestions = Array.isArray(payload?.suggestions)
        ? payload.suggestions.slice(0, 5)
        : [];
    } catch (error) {
      console.warn("Sugestões indisponíveis:", error);
      browserSuggestions = [
        query,
        `${query} youtube`,
        `${query} imagens`
      ];
    }
  }, 280);
}

function submitBrowserSearch(mode = activeSearchMode) {
  const query = browserQuery.trim();
  if (!query) {
    keyboardVisible = true;
    return;
  }

  activeSearchMode = mode;
  localStorage.setItem("hf_browser_query", query);

  let url;
  if (mode === "images") {
    url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  } else if (mode === "youtube") {
    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  } else {
    url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  window.location.assign(url);
}

function handleVirtualKey(key) {
  if (key === "⌫") {
    browserQuery = browserQuery.slice(0, -1);
  } else if (key === "ESPAÇO") {
    if (browserQuery && !browserQuery.endsWith(" ")) {
      browserQuery += " ";
    }
  } else if (key === "BUSCAR") {
    submitBrowserSearch(activeSearchMode);
    return;
  } else if (key === "FECHAR") {
    keyboardVisible = false;
    return;
  } else if (browserQuery.length < 100) {
    browserQuery += key.toLowerCase();
  }

  scheduleBrowserSuggestions();
}

function handleBrowserRegion(region, hand, pointer, now) {
  if (!region) return false;

  if (region.id === "panel-title") {
    const layout = getBrowserLayout();
    browserDrag = {
      handKey: hand.handKey,
      offsetX: pointer.x - (browserPanel.x + getSpatialOffset().x),
      offsetY: pointer.y - (browserPanel.y + getSpatialOffset().y)
    };
    return true;
  }

  if (region.id === "search-field") {
    keyboardVisible = true;
    return true;
  }

  if (region.id === "search-google") {
    activeSearchMode = "google";
    submitBrowserSearch("google");
    return true;
  }

  if (region.id === "search-images") {
    activeSearchMode = "images";
    submitBrowserSearch("images");
    return true;
  }

  if (region.id === "search-youtube") {
    activeSearchMode = "youtube";
    submitBrowserSearch("youtube");
    return true;
  }

  if (region.id.startsWith("suggestion:")) {
    browserQuery = region.text || "";
    scheduleBrowserSuggestions();
    keyboardVisible = true;
    return true;
  }

  if (region.id.startsWith("key:")) {
    handleVirtualKey(region.key);
    return true;
  }

  if (region.id === "cube") {
    recenterSpatialUi();
    keyboardVisible = !keyboardVisible;
    return true;
  }

  return false;
}

function processBrowserInteractions(hands, now) {
  if (!browserVisible) {
    browserDrag = null;
    return;
  }

  const liveKeys = new Set(hands.map((hand) => hand.handKey));

  for (const [key] of uiHandStates) {
    if (!liveKeys.has(key)) {
      uiHandStates.delete(key);
      if (browserDrag?.handKey === key) browserDrag = null;
    }
  }

  for (const hand of hands) {
    const pointer = {
      x: hand.points[8].x,
      y: hand.points[8].y
    };
    const state = uiHandStates.get(hand.handKey) || {
      wasPinching: false,
      okStart: 0,
      okTriggered: false
    };

    if (hand.gesture.okSign) {
      if (!state.okStart) state.okStart = now;

      if (
        !state.okTriggered &&
        now - state.okStart >= 520 &&
        !hitBrowserRegion(pointer)
      ) {
        keyboardVisible = !keyboardVisible;
        state.okTriggered = true;
      }
    } else {
      state.okStart = 0;
      state.okTriggered = false;
    }

    if (browserDrag?.handKey === hand.handKey) {
      if (hand.gesture.pinching) {
        const spatial = getSpatialOffset();
        browserPanel.x = clamp(
          pointer.x - browserDrag.offsetX - spatial.x,
          browserPanel.width / 2 + 0.02,
          1 - browserPanel.width / 2 - 0.02
        );
        browserPanel.y = clamp(
          pointer.y - browserDrag.offsetY - spatial.y,
          browserPanel.height / 2 + 0.02,
          1 - browserPanel.height / 2 - 0.02
        );
      } else {
        browserDrag = null;
      }
    }

    const pinchStarted =
      hand.gesture.pinching &&
      !state.wasPinching &&
      now - lastUiClickAt > 115;

    if (pinchStarted) {
      const region = hitBrowserRegion(pointer);
      if (region && handleBrowserRegion(region, hand, pointer, now)) {
        lastUiClickAt = now;
      }
    }

    state.wasPinching = hand.gesture.pinching;
    uiHandStates.set(hand.handKey, state);
  }

  keyboardToggleButton.textContent =
    `Teclado: ${keyboardVisible ? "ON" : "OFF"}`;
}

function render(hands, now) {
  const width = canvas.width;
  const height = canvas.height;
  const eyeCount = vrMode ? 2 : 1;
  const eyeWidth = width / eyeCount;

  processBrowserInteractions(hands, now);

  ctx.clearRect(0, 0, width, height);

  for (let eye = 0; eye < eyeCount; eye += 1) {
    const eyeX = eye * eyeWidth;
    const eyeSign = eyeCount === 1 ? 0 : eye === 0 ? -1 : 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(eyeX, 0, eyeWidth, height);
    ctx.clip();

    drawCameraEye(eyeX, eyeWidth, height);
    drawLabObjects(eyeX, eyeWidth, height, eyeSign);
    drawBrowserUiForEye(eyeX, eyeWidth, height, eyeSign);

    for (const hand of hands) {
      if (eye === 0 && !browserVisible) {
        const screenConsumedGesture = interactWithSpatialScreen(
          hand.handKey,
          hand.points,
          hand.gesture
        );
        if (!screenConsumedGesture) {
          interactWithObjects(hand.handKey, hand.points, hand.gesture);
        }
      }

      drawHand(
        hand.points,
        hand.label,
        hand.gesture,
        eyeX,
        eyeWidth,
        height,
        eyeSign
      );
      drawBrowserPointerForEye(hand, eyeX, eyeWidth, height);
    }

    ctx.restore();
  }

  if (vrMode) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(width / 2 - 1, 0, 2, height);
  }

  if (spatialLayoutDirty) {
    updateSpatialLayout();
  }

  if (!browserVisible) {
    updateSpatialCursors(hands);
  } else {
    [cursorSingle, cursorLeft, cursorRight].forEach((cursor) =>
      cursor.classList.add("hidden")
    );
  }

  if (now - lastHudAt >= 250) {
    updateHud(hands);
    lastHudAt = now;
  }
}

function updateHud(hands) {
  const count = hands?.length || 0;
  handsLabel.textContent = `${count} ${count === 1 ? "mão" : "mãos"}`;

  if (!count) {
    gestureLabel.textContent =
      `Sem mãos • ${currentProfile().label}` +
      (browserVisible ? " • Google" : "");
    return;
  }

  const labels = hands.map((hand) => {
    const translated =
      hand.label === "Left"
        ? "Esquerda"
        : hand.label === "Right"
          ? "Direita"
          : hand.label;
    return `${translated}: ${hand.gesture.name}`;
  });

  gestureLabel.textContent =
    `${labels.join(" • ")} • ${currentProfile().label}` +
    (keyboardVisible ? " • Teclado" : "");
}

async function createLandmarker() {
  setStatus("Carregando inteligência de rastreamento...");

  try {
    handLandmarker?.close?.();
  } catch {
    // Alguns navegadores não oferecem close().
  }
  handLandmarker = null;

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const profile = currentProfile();

  const commonOptions = {
    baseOptions: {
      modelAssetPath: MODEL_URL
    },
    runningMode: "VIDEO",
    numHands: profile.numHands,
    minHandDetectionConfidence: 0.48,
    minHandPresenceConfidence: 0.42,
    minTrackingConfidence: 0.42
  };

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...commonOptions,
      baseOptions: {
        ...commonOptions.baseOptions,
        delegate: "GPU"
      }
    });
  } catch (gpuError) {
    console.warn("GPU indisponível; usando CPU.", gpuError);
    handLandmarker = await HandLandmarker.createFromOptions(
      vision,
      commonOptions
    );
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Este navegador não liberou a câmera. Abra em um endereço HTTPS."
    );
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  setStatus("Pedindo acesso à câmera...");
  const profile = currentProfile();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: profile.cameraWidth },
      height: { ideal: profile.cameraHeight },
      frameRate: {
        ideal: profile.cameraFps,
        max: profile.cameraFps
      }
    }
  });

  video.srcObject = stream;
  await video.play();

  if (!video.videoWidth) {
    await new Promise((resolve) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (error) {
    console.warn("Wake Lock não disponível.", error);
  }
}

async function requestFullscreen() {
  const target = document.documentElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } catch (error) {
    console.warn("Tela cheia não disponível.", error);
  }

  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // iOS pode negar o bloqueio de orientação.
  }
}

function updateFps(now) {
  const delta = Math.max(1, now - lastFrameTimestamp);
  const instant = 1000 / delta;
  fpsAverage = fpsAverage ? fpsAverage * 0.88 + instant * 0.12 : instant;
  lastFrameTimestamp = now;

  if (now - lastHudAt >= 220) {
    fpsLabel.textContent = `${Math.round(fpsAverage)} FPS`;
  }
}

function loop(now) {
  if (!running) return;

  const profile = currentProfile();
  const inferenceInterval = 1000 / profile.trackingFps;
  const renderInterval = 1000 / profile.renderFps;

  if (
    !profileChanging &&
    handLandmarker &&
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime &&
    now - lastInferenceAt >= inferenceInterval
  ) {
    lastVideoTime = video.currentTime;
    lastInferenceAt = now;

    try {
      lastResults = handLandmarker.detectForVideo(video, now);
      preparedHands = prepareHands(lastResults);
    } catch (error) {
      console.error("Falha no frame de rastreamento:", error);
    }
  }

  if (now - lastRenderAt >= renderInterval) {
    updateFps(now);
    render(preparedHands, now);
    lastRenderAt = now;
  }

  requestAnimationFrame(loop);
}

async function startExperience() {
  startButton.disabled = true;

  try {
    startButton.textContent = "Carregando...";
    const orientationPermissionPromise = requestOrientationTracking();
    performanceMode = performancePreset.value;
    updatePerformanceUi();
    resizeCanvas();
    await loadMediaPipe();
    await Promise.all([
      createLandmarker(),
      startCamera(),
      orientationPermissionPromise
    ]);
    await requestWakeLock();

    running = true;
    startPanel.classList.add("hidden");
    hud.classList.remove("hidden");
    controls.classList.remove("hidden");
    browserVisible = true;
    if (performanceMode === "lite") {
      skeletonEnabled = false;
    }
    skeletonButton.textContent = `Mãos: ${skeletonEnabled ? "ON" : "OFF"}`;
    browserButton.textContent = "Google: ON";
    keyboardToggleButton.textContent = "Teclado: OFF";
    scheduleBrowserSuggestions();
    resizeCanvas();
    lastInferenceAt = 0;
    lastRenderAt = 0;
    lastHudAt = 0;
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Não foi possível iniciar.");
    startButton.textContent = "Tentar novamente";
    startButton.disabled = false;
  }
}

startButton.addEventListener("click", startExperience);

vrButton.addEventListener("click", () => {
  vrMode = !vrMode;
  vrButton.textContent = vrMode ? "Modo VR" : "Visão única";
  spatialLayoutDirty = true;
  updateYoutubeAudioMode();
  syncYouTubePlayers();
});

browserButton.addEventListener("click", () => {
  browserVisible = !browserVisible;
  browserButton.textContent = `Google: ${browserVisible ? "ON" : "OFF"}`;
  document.body.classList.toggle("browser-active", browserVisible);
});

keyboardToggleButton.addEventListener("click", () => {
  keyboardVisible = !keyboardVisible;
  keyboardToggleButton.textContent =
    `Teclado: ${keyboardVisible ? "ON" : "OFF"}`;
});

recenterButton.addEventListener("click", () => {
  recenterSpatialUi();
});

performancePreset.addEventListener("change", () => {
  applyPerformanceMode(performancePreset.value, running);
});

performanceButton.addEventListener("click", async () => {
  const modes = ["lite", "balanced", "quality"];
  const nextIndex = (modes.indexOf(performanceMode) + 1) % modes.length;
  await applyPerformanceMode(modes[nextIndex], true);
});

skeletonButton.addEventListener("click", () => {
  skeletonEnabled = !skeletonEnabled;
  skeletonButton.textContent = `Mãos: ${skeletonEnabled ? "ON" : "OFF"}`;
});

objectsButton.addEventListener("click", () => {
  objectsEnabled = !objectsEnabled;
  objectsButton.textContent = `Objetos: ${objectsEnabled ? "ON" : "OFF"}`;
});

cameraButton.addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  smoothedByHand.clear();
  grabbedByHand.clear();

  try {
    await startCamera();
  } catch (error) {
    console.error(error);
    gestureLabel.textContent = "Erro ao trocar câmera";
  }
});


screenButton.addEventListener("click", () => {
  browserVisible = false;
  browserButton.textContent = "Google: OFF";
  screenPanel.classList.remove("hidden");
  controls.classList.add("hidden");
  showControlsButton.classList.add("hidden");
});

closeScreenPanelButton.addEventListener("click", () => {
  screenPanel.classList.add("hidden");
  controls.classList.remove("hidden");
});

loadYoutubeButton.addEventListener("click", async () => {
  const videoId = parseYouTubeVideoId(youtubeUrlInput.value);

  if (!videoId) {
    setScreenStatus("Link inválido. Cole o link completo de um vídeo.");
    return;
  }

  loadYoutubeButton.disabled = true;
  loadYoutubeButton.textContent = "Carregando...";

  try {
    await createYouTubePlayers(videoId);
  } catch (error) {
    console.error(error);
    setScreenStatus(error?.message || "Não consegui abrir o vídeo.");
  } finally {
    loadYoutubeButton.disabled = false;
    loadYoutubeButton.textContent = "Carregar vídeo";
  }
});

playYoutubeButton.addEventListener("click", playYouTube);
pauseYoutubeButton.addEventListener("click", pauseYouTube);

centerScreenButton.addEventListener("click", () => {
  spatialScreenState.x = 0.5;
  spatialScreenState.y = 0.46;
  spatialLayoutDirty = true;
  showSpatialScreen(true);
});

hideScreenButton.addEventListener("click", () => {
  showSpatialScreen(false);
});

screenVisibilityButton.addEventListener("click", () => {
  if (!screenHasVideo && !screenVisible) {
    screenPanel.classList.remove("hidden");
    controls.classList.add("hidden");
    return;
  }
  showSpatialScreen(!screenVisible);
});

screenSizeInput.addEventListener("input", () => {
  spatialScreenState.width = Number(screenSizeInput.value);
  spatialLayoutDirty = true;
});

youtubeUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadYoutubeButton.click();
  }
});


fullscreenButton.addEventListener("click", requestFullscreen);

hideControlsButton.addEventListener("click", () => {
  controls.classList.add("hidden");
  showControlsButton.classList.remove("hidden");
});

showControlsButton.addEventListener("click", () => {
  controls.classList.remove("hidden");
  showControlsButton.classList.add("hidden");
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && running && !wakeLock) {
    await requestWakeLock();
  }
});

resizeCanvas();


window.addEventListener("error", (event) => {
  console.error("Erro global:", event.error || event.message);
  if (!running) {
    setStatus(`Erro: ${event.message || "falha ao carregar o aplicativo"}`);
    startButton.disabled = false;
    startButton.textContent = "Tentar novamente";
  }
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promessa rejeitada:", event.reason);
  if (!running) {
    const message = event.reason?.message || "falha inesperada";
    setStatus(`Erro: ${message}`);
    startButton.disabled = false;
    startButton.textContent = "Tentar novamente";
  }
});
