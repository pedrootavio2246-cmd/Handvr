// HandFusion VR v0.2
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

let handLandmarker = null;
let stream = null;
let facingMode = "environment";
let vrMode = true;
let objectsEnabled = true;
let running = false;
let lastVideoTime = -1;
let lastFrameTimestamp = performance.now();
let fpsAverage = 0;
let lastResults = null;
let wakeLock = null;

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

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const portrait = window.innerHeight > window.innerWidth;
  rotateNotice.classList.toggle("hidden", !portrait || !running);
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

  const extended = [
    fingerExtended(points, 8, 6),
    fingerExtended(points, 12, 10),
    fingerExtended(points, 16, 14),
    fingerExtended(points, 20, 18)
  ].filter(Boolean).length;

  if (pinchRatio < 0.34) {
    return { name: "Pinça", pinching: true, pinchRatio };
  }
  if (extended >= 4) {
    return { name: "Mão aberta", pinching: false, pinchRatio };
  }
  if (extended <= 1) {
    return { name: "Punho", pinching: false, pinchRatio };
  }
  if (fingerExtended(points, 8, 6) && extended <= 2) {
    return { name: "Apontando", pinching: false, pinchRatio };
  }
  return { name: "Rastreando", pinching: false, pinchRatio };
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
    ctx.shadowBlur = radius * 0.7;
    ctx.shadowColor = "rgba(30, 210, 255, 0.7)";

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
  ctx.lineWidth = Math.max(2, eyeWidth * 0.006);
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(0,0,0,0.55)";

  for (const [start, end] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(projected[start].x, projected[start].y);
    ctx.lineTo(projected[end].x, projected[end].y);
    ctx.stroke();
  }

  const dotRadius = Math.max(2.2, eyeWidth * 0.007);
  projected.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      index === 4 || index === 8 ? dotRadius * 1.45 : dotRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  const pinchPoint = {
    x: (projected[4].x + projected[8].x) / 2,
    y: (projected[4].y + projected[8].y) / 2
  };

  if (gesture.pinching) {
    ctx.strokeStyle = "rgba(255, 235, 92, 1)";
    ctx.lineWidth = Math.max(3, eyeWidth * 0.009);
    ctx.beginPath();
    ctx.arc(pinchPoint.x, pinchPoint.y, dotRadius * 3.2, 0, Math.PI * 2);
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

function render(results) {
  resizeCanvas();

  const width = canvas.width;
  const height = canvas.height;
  const eyeCount = vrMode ? 2 : 1;
  const eyeWidth = width / eyeCount;

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

    if (results?.landmarks?.length) {
      results.landmarks.forEach((rawPoints, index) => {
        const label = getHandLabel(results, index);
        const handKey = `${label}-${index}`;
        const points = smoothLandmarks(handKey, rawPoints);
        const gesture = detectGesture(points);

        if (eye === 0) {
          interactWithObjects(handKey, points, gesture);
        }

        drawHand(
          points,
          label,
          gesture,
          eyeX,
          eyeWidth,
          height,
          eyeSign
        );
      });
    }

    ctx.restore();
  }

  if (vrMode) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(width / 2 - 2, 0, 4, height);
  }

  updateHud(results);
}

function updateHud(results) {
  const count = results?.landmarks?.length || 0;
  handsLabel.textContent = `${count} ${count === 1 ? "mão" : "mãos"}`;

  if (!count) {
    gestureLabel.textContent = "Sem mãos";
    return;
  }

  const labels = results.landmarks.map((points, index) => {
    const label = getHandLabel(results, index);
    const handKey = `${label}-${index}`;
    const smoothed = smoothedByHand.get(handKey) || points;
    const gesture = detectGesture(smoothed);
    const translated = label === "Left" ? "Esquerda" : label === "Right" ? "Direita" : label;
    return `${translated}: ${gesture.name}`;
  });

  gestureLabel.textContent = labels.join(" • ");
}

async function createLandmarker() {
  setStatus("Carregando inteligência de rastreamento...");

  const vision = await FilesetResolver.forVisionTasks(
    MEDIAPIPE_WASM_URL
  );

  const commonOptions = {
    baseOptions: {
      modelAssetPath: MODEL_URL
    },
    runningMode: "VIDEO",
    numHands: 2,
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
      "Este navegador não liberou a câmera. Abra pelo Safari em um endereço HTTPS."
    );
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  setStatus("Pedindo acesso à câmera...");

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 }
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
  fpsAverage = fpsAverage ? fpsAverage * 0.9 + instant * 0.1 : instant;
  lastFrameTimestamp = now;
  fpsLabel.textContent = `${Math.round(fpsAverage)} FPS`;
}

function loop(now) {
  if (!running) return;

  updateFps(now);

  if (
    handLandmarker &&
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;

    try {
      lastResults = handLandmarker.detectForVideo(video, now);
    } catch (error) {
      console.error("Falha no frame de rastreamento:", error);
    }
  }

  render(lastResults);
  requestAnimationFrame(loop);
}

async function startExperience() {
  startButton.disabled = true;

  try {
    startButton.textContent = "Carregando...";
    await loadMediaPipe();
    await Promise.all([createLandmarker(), startCamera()]);
    await requestWakeLock();

    running = true;
    startPanel.classList.add("hidden");
    hud.classList.remove("hidden");
    controls.classList.remove("hidden");
    resizeCanvas();
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
