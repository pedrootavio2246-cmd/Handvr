// HandFusion VR v0.6 — cena 3D real, duas mãos e AR 6DoF experimental.

const THREE_VERSION = "0.170.0";
const THREE_URL =
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;

const MEDIAPIPE_VERSION = "0.10.35";
const MEDIAPIPE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`;
const MEDIAPIPE_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let THREE = null;
let FilesetResolver = null;
let HandLandmarker = null;
let handLandmarker = null;

const video = document.querySelector("#camera");
const canvas = document.querySelector("#view");
const startPanel = document.querySelector("#startPanel");
const startButton = document.querySelector("#startButton");
const bootStatus = document.querySelector("#bootStatus");
const performancePreset = document.querySelector("#performancePreset");
const hud = document.querySelector("#hud");
const fpsLabel = document.querySelector("#fps");
const handsLabel = document.querySelector("#hands");
const gestureLabel = document.querySelector("#gesture");
const modeLabel = document.querySelector("#modeLabel");
const controls = document.querySelector("#controls");
const showControlsButton = document.querySelector("#showControlsButton");
const hideControlsButton = document.querySelector("#hideControlsButton");
const vrButton = document.querySelector("#vrButton");
const browserButton = document.querySelector("#browserButton");
const keyboardButton = document.querySelector("#keyboardButton");
const handsButton = document.querySelector("#handsButton");
const rotateButton = document.querySelector("#rotateButton");
const recenterButton = document.querySelector("#recenterButton");
const arButton = document.querySelector("#arButton");
const cameraButton = document.querySelector("#cameraButton");
const performanceButton = document.querySelector("#performanceButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const smoothingInput = document.querySelector("#smoothing");
const eyeSeparationInput = document.querySelector("#eyeSeparation");
const rotateNotice = document.querySelector("#rotateNotice");

const IS_ANDROID = /Android/i.test(navigator.userAgent);
const PERFORMANCE_PROFILES = {
  lite: {
    label: "Leve",
    renderScale: 0.58,
    cameraWidth: 640,
    cameraHeight: 360,
    cameraFps: 20,
    trackingFps: 9,
    renderFps: 30,
    fullHand: false
  },
  balanced: {
    label: "Equilibrado",
    renderScale: 0.78,
    cameraWidth: 854,
    cameraHeight: 480,
    cameraFps: 24,
    trackingFps: 14,
    renderFps: 42,
    fullHand: true
  },
  quality: {
    label: "Qualidade",
    renderScale: 1.0,
    cameraWidth: 1280,
    cameraHeight: 720,
    cameraFps: 30,
    trackingFps: 20,
    renderFps: 60,
    fullHand: true
  }
};

let performanceMode = IS_ANDROID ? "lite" : "balanced";
let facingMode = "environment";
let stream = null;
let running = false;
let wakeLock = null;
let vrMode = true;
let panelVisible = true;
let keyboardVisible = false;
let handVisualsVisible = true;
let xrSession = null;
let xrPlacementPending = false;
let restartingAfterXR = false;

let renderer = null;
let scene = null;
let backgroundScene = null;
let backgroundCamera = null;
let backgroundPlane = null;
let videoTexture = null;
let baseCamera = null;
let leftCamera = null;
let rightCamera = null;
let worldRoot = null;
let panelRoot = null;
let keyboardRoot = null;
let cubeMesh = null;
let panelHandle = null;
let searchFieldMesh = null;
let searchButtonMeshes = [];
let suggestionMeshes = [];
let keyboardKeysMesh = null;
let keyboardKeyData = [];
let interactiveObjects = [];
let handVisuals = [];
let panelBackLabel = null;

let browserQuery = localStorage.getItem("hf_browser_query") || "";
let browserSuggestions = [];
let suggestionTimer = null;
let activeSearchMode = "google";

let lastVideoTime = -1;
let lastInferenceAt = 0;
let lastRenderAt = 0;
let lastFpsAt = performance.now();
let fpsAverage = 0;
let lastHudAt = 0;
let preparedHands = [];

const smoothedHands = new Map();
const handInteractionStates = new Map();

const orientationState = {
  permission: "unknown",
  rawQuaternion: null,
  baseInverse: null,
  received: false
};

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]
];

const KEY_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","⌫"],
  ["FECHAR","ESPAÇO","BUSCAR"]
];

const temp = {
  vector: null,
  vector2: null,
  quaternion: null,
  matrix: null,
  raycaster: null,
  dragPlane: null,
  dragPoint: null
};

function setStatus(message) {
  bootStatus.textContent = message;
}

function currentProfile() {
  return PERFORMANCE_PROFILES[performanceMode];
}

async function loadLibraries() {
  if (THREE && FilesetResolver && HandLandmarker) return;

  setStatus("Carregando motor 3D e rastreamento...");

  try {
    const [threeModule, visionModule] = await Promise.all([
      import(THREE_URL),
      import(MEDIAPIPE_URL)
    ]);

    THREE = threeModule;
    FilesetResolver = visionModule.FilesetResolver;
    HandLandmarker = visionModule.HandLandmarker;
  } catch (error) {
    console.error(error);
    throw new Error(
      "Não consegui carregar Three.js ou MediaPipe. Verifique a internet."
    );
  }
}

function roundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  shape.closePath();

  return shape;
}

function roundedExtrudeGeometry(width, height, depth, radius) {
  const geometry = new THREE.ExtrudeGeometry(
    roundedRectShape(width, height, radius),
    {
      depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: performanceMode === "lite" ? 3 : 6
    }
  );
  geometry.center();
  return geometry;
}

function createTextCanvas(
  width,
  height,
  {
    background = "transparent",
    color = "#182233",
    font = "700 42px system-ui",
    text = "",
    align = "center",
    padding = 24,
    radius = 24
  } = {}
) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  const context = surface.getContext("2d");

  context.clearRect(0, 0, width, height);

  if (background !== "transparent") {
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(0, 0, width, height, radius);
    context.fill();
  }

  context.fillStyle = color;
  context.font = font;
  context.textBaseline = "middle";
  context.textAlign = align;

  const x = align === "left" ? padding : width / 2;
  const maximumWidth = width - padding * 2;
  context.fillText(text, x, height / 2, maximumWidth);

  return { canvas: surface, context };
}

function textureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createLabelPlane(width, height, canvas, z = 0.018) {
  const material = new THREE.MeshBasicMaterial({
    map: textureFromCanvas(canvas),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    material
  );
  mesh.position.z = z;
  return mesh;
}

function create3DButton({
  width,
  height,
  depth = 0.025,
  radius = 0.03,
  label,
  color = 0xe8edf5,
  textColor = "#243044",
  action
}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    roundedExtrudeGeometry(width, height, depth, radius),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide
    })
  );
  body.userData.action = action;
  body.userData.buttonGroup = group;
  group.add(body);

  const labelSurface = createTextCanvas(512, 140, {
    text: label,
    color: textColor,
    font: "800 54px system-ui",
    background: "transparent"
  });
  const labelPlane = createLabelPlane(
    width * 0.9,
    height * 0.72,
    labelSurface.canvas,
    depth / 2 + 0.002
  );
  group.add(labelPlane);

  group.userData.body = body;
  group.userData.labelPlane = labelPlane;
  group.userData.labelSurface = labelSurface;

  return group;
}

function updateButtonLabel(group, text, textColor = "#243044") {
  const { canvas, context } = group.userData.labelSurface;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = textColor;
  context.font = "800 54px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 30);
  group.userData.labelPlane.material.map.needsUpdate = true;
}

function createGoogleLogoCanvas() {
  const surface = document.createElement("canvas");
  surface.width = 800;
  surface.height = 180;
  const context = surface.getContext("2d");
  const letters = [
    ["G", "#4285F4"],
    ["o", "#EA4335"],
    ["o", "#FBBC05"],
    ["g", "#4285F4"],
    ["l", "#34A853"],
    ["e", "#EA4335"]
  ];

  context.font = "800 112px system-ui";
  context.textBaseline = "middle";
  context.textAlign = "left";

  const widths = letters.map(([letter]) => context.measureText(letter).width);
  const totalWidth = widths.reduce((sum, value) => sum + value, 0);
  let x = (surface.width - totalWidth) / 2;

  letters.forEach(([letter, color], index) => {
    context.fillStyle = color;
    context.fillText(letter, x, surface.height / 2);
    x += widths[index];
  });

  return surface;
}

function createPanel3D() {
  panelRoot = new THREE.Group();
  panelRoot.position.set(0, 0.08, -1.5);
  worldRoot.add(panelRoot);

  const panelBody = new THREE.Mesh(
    roundedExtrudeGeometry(1.52, 0.88, 0.075, 0.095),
    new THREE.MeshBasicMaterial({
      color: 0x243248,
      side: THREE.DoubleSide
    })
  );
  panelRoot.add(panelBody);

  const frontPlate = new THREE.Mesh(
    roundedExtrudeGeometry(1.40, 0.76, 0.022, 0.073),
    new THREE.MeshBasicMaterial({
      color: 0xf5f7fb,
      side: THREE.DoubleSide
    })
  );
  frontPlate.position.z = 0.047;
  panelRoot.add(frontPlate);

  const backSurface = createTextCanvas(720, 400, {
    text: "HandFusion VR\nv0.6",
    color: "#d9ebff",
    background: "#172234",
    font: "800 68px system-ui"
  });
  panelBackLabel = createLabelPlane(
    1.22,
    0.52,
    backSurface.canvas,
    -0.039
  );
  panelBackLabel.rotation.y = Math.PI;
  panelRoot.add(panelBackLabel);

  const logo = createLabelPlane(
    0.58,
    0.13,
    createGoogleLogoCanvas(),
    0.062
  );
  logo.position.y = 0.27;
  panelRoot.add(logo);

  const searchField = create3DButton({
    width: 1.18,
    height: 0.13,
    depth: 0.026,
    radius: 0.055,
    label: browserQuery || "Toque e escreva com a mão",
    color: 0xffffff,
    textColor: browserQuery ? "#202124" : "#788292",
    action: "focus-search"
  });
  searchField.position.set(0, 0.115, 0.064);
  panelRoot.add(searchField);
  searchFieldMesh = searchField.userData.body;
  searchFieldMesh.userData.owner = searchField;
  interactiveObjects.push(searchFieldMesh);

  const actions = [
    ["Pesquisar", "search-google"],
    ["Imagens", "search-images"],
    ["YouTube", "search-youtube"]
  ];

  actions.forEach(([label, action], index) => {
    const button = create3DButton({
      width: 0.36,
      height: 0.105,
      depth: 0.026,
      radius: 0.035,
      label,
      color: action === "search-google" ? 0x4285f4 : 0xe5ebf3,
      textColor: action === "search-google" ? "#ffffff" : "#263345",
      action
    });
    button.position.set(-0.40 + index * 0.40, -0.035, 0.064);
    panelRoot.add(button);
    button.userData.body.userData.owner = button;
    searchButtonMeshes.push(button.userData.body);
    interactiveObjects.push(button.userData.body);
  });

  for (let index = 0; index < 3; index += 1) {
    const suggestion = create3DButton({
      width: 1.11,
      height: 0.075,
      depth: 0.018,
      radius: 0.022,
      label: "",
      color: 0xeef2f7,
      textColor: "#39465a",
      action: `suggestion-${index}`
    });
    suggestion.position.set(0, -0.17 - index * 0.09, 0.061);
    suggestion.visible = false;
    panelRoot.add(suggestion);
    suggestion.userData.body.userData.owner = suggestion;
    suggestionMeshes.push(suggestion);
    interactiveObjects.push(suggestion.userData.body);
  }

  panelHandle = new THREE.Mesh(
    new THREE.BoxGeometry(1.34, 0.075, 0.025),
    new THREE.MeshBasicMaterial({
      color: 0x8fa4bf,
      transparent: true,
      opacity: 0.08
    })
  );
  panelHandle.position.set(0, 0.395, 0.068);
  panelHandle.userData.action = "drag-panel";
  panelRoot.add(panelHandle);
  interactiveObjects.push(panelHandle);

  const cubeMaterial = [
    0x4e8fd1,
    0x2d6da9,
    0x6ab4ef,
    0x327cb7,
    0xdcefff,
    0x17334f
  ].map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide
      })
  );

  cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    cubeMaterial
  );
  cubeMesh.position.set(0.90, 0.19, 0.02);
  cubeMesh.rotation.set(0.22, 0.42, 0.08);
  cubeMesh.userData.action = "rotate-panel";
  panelRoot.add(cubeMesh);
  interactiveObjects.push(cubeMesh);

  createKeyboard3D();
  refreshPanelTextures();
}

function buildKeyboardLayout(width, height) {
  const result = [];
  const sidePadding = 0.055;
  const topPadding = 0.045;
  const gapX = 0.014;
  const gapY = 0.018;
  const rowHeight = 0.105;

  KEY_ROWS.forEach((row, rowIndex) => {
    const weights = row.map((key) => {
      if (key === "ESPAÇO") return 3.2;
      if (key === "BUSCAR") return 2.0;
      if (key === "FECHAR") return 1.75;
      return 1;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const available =
      width - sidePadding * 2 - gapX * (row.length - 1);
    let x = -width / 2 + sidePadding;

    row.forEach((key, index) => {
      const keyWidth = available * (weights[index] / totalWeight);
      result.push({
        key,
        x: x + keyWidth / 2,
        y: height / 2 - topPadding - rowHeight / 2 -
          rowIndex * (rowHeight + gapY),
        width: keyWidth,
        height: rowHeight
      });
      x += keyWidth + gapX;
    });
  });

  return result;
}

function createKeyboardLabelCanvas(layout, width, height) {
  const surface = document.createElement("canvas");
  surface.width = 1400;
  surface.height = 540;
  const context = surface.getContext("2d");
  context.clearRect(0, 0, surface.width, surface.height);

  layout.forEach((item) => {
    const x = ((item.x + width / 2) / width) * surface.width;
    const y = ((height / 2 - item.y) / height) * surface.height;
    context.fillStyle = item.key === "BUSCAR" ? "#ffffff" : "#202632";
    context.font =
      item.key.length > 2
        ? "800 31px system-ui"
        : "800 47px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.key, x, y);
  });

  return surface;
}

function createKeyboard3D() {
  const width = 1.52;
  const height = 0.54;
  const keyDepth = 0.035;

  keyboardRoot = new THREE.Group();
  keyboardRoot.position.set(0, -0.75, 0.20);
  keyboardRoot.rotation.x = -0.31;
  keyboardRoot.visible = keyboardVisible;
  panelRoot.add(keyboardRoot);

  const base = new THREE.Mesh(
    roundedExtrudeGeometry(width, height, 0.055, 0.075),
    new THREE.MeshBasicMaterial({
      color: 0xcbd3df,
      side: THREE.DoubleSide
    })
  );
  keyboardRoot.add(base);

  keyboardKeyData = buildKeyboardLayout(width, height);
  const keyGeometry = roundedExtrudeGeometry(1, 1, 1, 0.16);
  const keyMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide
  });

  keyboardKeysMesh = new THREE.InstancedMesh(
    keyGeometry,
    keyMaterial,
    keyboardKeyData.length
  );
  keyboardKeysMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  keyboardKeysMesh.userData.action = "keyboard-key";

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  keyboardKeyData.forEach((item, index) => {
    position.set(item.x, item.y, 0.046);
    scale.set(item.width, item.height, keyDepth);
    matrix.compose(position, quaternion, scale);
    keyboardKeysMesh.setMatrixAt(index, matrix);
    keyboardKeysMesh.setColorAt(
      index,
      new THREE.Color(item.key === "BUSCAR" ? 0x4285f4 : 0xfafcff)
    );
  });
  keyboardKeysMesh.instanceMatrix.needsUpdate = true;
  if (keyboardKeysMesh.instanceColor) {
    keyboardKeysMesh.instanceColor.needsUpdate = true;
  }

  keyboardRoot.add(keyboardKeysMesh);
  interactiveObjects.push(keyboardKeysMesh);

  const labels = createLabelPlane(
    width,
    height,
    createKeyboardLabelCanvas(keyboardKeyData, width, height),
    0.069
  );
  labels.material.depthTest = true;
  keyboardRoot.add(labels);
}

function createHandVisual(color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95
    })
  );
  line.frustumCulled = false;
  scene.add(line);

  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    })
  );
  cursor.visible = false;
  scene.add(cursor);

  return { line, cursor };
}

function initializeThreeScene() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.setClearColor(0x05070d, 0);
  renderer.xr.enabled = false;

  scene = new THREE.Scene();
  backgroundScene = new THREE.Scene();
  backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);

  baseCamera = new THREE.PerspectiveCamera(72, 1, 0.02, 30);
  leftCamera = new THREE.PerspectiveCamera(72, 1, 0.02, 30);
  rightCamera = new THREE.PerspectiveCamera(72, 1, 0.02, 30);

  worldRoot = new THREE.Group();
  scene.add(worldRoot);

  temp.vector = new THREE.Vector3();
  temp.vector2 = new THREE.Vector3();
  temp.quaternion = new THREE.Quaternion();
  temp.matrix = new THREE.Matrix4();
  temp.raycaster = new THREE.Raycaster();
  temp.dragPlane = new THREE.Plane();
  temp.dragPoint = new THREE.Vector3();

  createPanel3D();
  handVisuals = [
    createHandVisual(0x55ffad),
    createHandVisual(0x55b9ff)
  ];

  resizeRenderer();
  renderer.setAnimationLoop(animationLoop);
}

function initializeVideoTexture() {
  if (videoTexture) {
    videoTexture.dispose();
  }

  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;

  if (facingMode === "user") {
    videoTexture.wrapS = THREE.RepeatWrapping;
    videoTexture.repeat.x = -1;
    videoTexture.offset.x = 1;
  }

  if (!backgroundPlane) {
    backgroundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: videoTexture,
        depthTest: false,
        depthWrite: false
      })
    );
    backgroundPlane.position.z = -1;
    backgroundScene.add(backgroundPlane);
  } else {
    backgroundPlane.material.map = videoTexture;
    backgroundPlane.material.needsUpdate = true;
  }
}

function resizeRenderer() {
  if (!renderer) return;

  const scale = currentProfile().renderScale;
  renderer.setSize(
    Math.max(1, Math.floor(window.innerWidth * scale)),
    Math.max(1, Math.floor(window.innerHeight * scale)),
    false
  );

  rotateNotice.classList.toggle(
    "hidden",
    !running || window.innerWidth >= window.innerHeight
  );
}

async function createHandLandmarker() {
  try {
    handLandmarker?.close?.();
  } catch {
    // Some browsers do not expose close().
  }

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const options = {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.47,
    minHandPresenceConfidence: 0.42,
    minTrackingConfidence: 0.42
  };

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        ...options.baseOptions,
        delegate: "GPU"
      }
    });
  } catch (error) {
    console.warn("GPU do MediaPipe indisponível, usando CPU.", error);
    handLandmarker = await HandLandmarker.createFromOptions(vision, options);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Abra o projeto em HTTPS para liberar a câmera.");
  }

  stopCamera();
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

  initializeVideoTexture();
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  stream = null;
  video.srcObject = null;
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (error) {
    console.warn("Wake lock indisponível.", error);
  }
}

async function requestOrientationPermission() {
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
    console.warn("Sensores de orientação indisponíveis.", error);
    orientationState.permission = "denied";
    return false;
  }
}

function sensorQuaternion(alpha, beta, gamma, screenAngle) {
  const zee = new THREE.Vector3(0, 0, 1);
  const euler = new THREE.Euler();
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(
    -Math.sqrt(0.5),
    0,
    0,
    Math.sqrt(0.5)
  );

  euler.set(beta, alpha, -gamma, "YXZ");
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  quaternion.multiply(q1);
  quaternion.multiply(
    q0.setFromAxisAngle(zee, -screenAngle)
  );
  return quaternion;
}

window.addEventListener(
  "deviceorientation",
  (event) => {
    if (
      !THREE ||
      event.alpha === null ||
      event.beta === null ||
      event.gamma === null
    ) {
      return;
    }

    const degreesToRadians = Math.PI / 180;
    const screenAngle =
      ((screen.orientation?.angle ?? window.orientation ?? 0) *
        degreesToRadians);

    orientationState.rawQuaternion = sensorQuaternion(
      event.alpha * degreesToRadians,
      event.beta * degreesToRadians,
      event.gamma * degreesToRadians,
      screenAngle
    );
    orientationState.received = true;

    if (!orientationState.baseInverse) {
      orientationState.baseInverse =
        orientationState.rawQuaternion.clone().invert();
    }
  },
  { passive: true }
);

function updateBaseCameraOrientation() {
  if (orientationState.rawQuaternion && orientationState.baseInverse) {
    baseCamera.quaternion
      .copy(orientationState.baseInverse)
      .multiply(orientationState.rawQuaternion);
  } else {
    baseCamera.quaternion.identity();
  }

  baseCamera.position.set(0, 0, 0);
  baseCamera.updateMatrixWorld(true);
}

function recenter() {
  if (orientationState.rawQuaternion) {
    orientationState.baseInverse =
      orientationState.rawQuaternion.clone().invert();
  }

  if (!renderer?.xr?.isPresenting) {
    panelRoot.position.set(0, 0.08, -1.5);
    panelRoot.rotation.set(0, 0, 0);
    panelRoot.scale.setScalar(1);
  }
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerExtended(points, tip, pip) {
  const wrist = points[0];
  return (
    distance2D(wrist, points[tip]) >
    distance2D(wrist, points[pip]) * 1.12
  );
}

function detectGesture(points) {
  const palmSize = Math.max(distance2D(points[0], points[9]), 0.001);
  const pinchRatio = distance2D(points[4], points[8]) / palmSize;

  const middleExtended = fingerExtended(points, 12, 10);
  const ringExtended = fingerExtended(points, 16, 14);
  const pinkyExtended = fingerExtended(points, 20, 18);
  const indexExtended = fingerExtended(points, 8, 6);

  const extendedCount = [
    indexExtended,
    middleExtended,
    ringExtended,
    pinkyExtended
  ].filter(Boolean).length;

  const pinching = pinchRatio < 0.34;
  const okSign =
    pinchRatio < 0.30 &&
    !middleExtended &&
    !ringExtended &&
    !pinkyExtended;

  if (okSign) {
    return { name: "OK", pinching: true, okSign: true };
  }
  if (pinching) {
    return { name: "Pinça", pinching: true, okSign: false };
  }
  if (extendedCount >= 4) {
    return { name: "Mão aberta", pinching: false, okSign: false };
  }
  if (extendedCount <= 1) {
    return { name: "Punho", pinching: false, okSign: false };
  }
  if (indexExtended && extendedCount <= 2) {
    return { name: "Apontando", pinching: false, okSign: false };
  }

  return { name: "Rastreando", pinching: false, okSign: false };
}

function getHandLabel(results, index) {
  return results?.handedness?.[index]?.[0]?.categoryName || `Hand-${index}`;
}

function smoothLandmarks(key, landmarks) {
  const smoothing = Number(smoothingInput.value);
  const previous = smoothedHands.get(key);

  if (!previous) {
    const fresh = landmarks.map((point) => ({ ...point }));
    smoothedHands.set(key, fresh);
    return fresh;
  }

  const next = landmarks.map((point, index) => ({
    x: previous[index].x * smoothing + point.x * (1 - smoothing),
    y: previous[index].y * smoothing + point.y * (1 - smoothing),
    z: previous[index].z * smoothing + point.z * (1 - smoothing)
  }));

  smoothedHands.set(key, next);
  return next;
}

function prepareHands(results) {
  if (!results?.landmarks?.length) return [];

  return results.landmarks.map((landmarks, index) => {
    const label = getHandLabel(results, index);
    const key = `${label}-${index}`;
    const points = smoothLandmarks(key, landmarks);

    return {
      key,
      label,
      points,
      gesture: detectGesture(points)
    };
  });
}

function normalizedX(value) {
  return facingMode === "user" ? 1 - value : value;
}

function setRayFromLandmark(point) {
  const x = normalizedX(point.x) * 2 - 1;
  const y = -(point.y * 2 - 1);
  temp.raycaster.setFromCamera({ x, y }, baseCamera);
}

function pointOnViewRay(point, distance) {
  setRayFromLandmark(point);
  return temp.raycaster.ray.at(distance, new THREE.Vector3());
}

function updateHandVisuals(hands) {
  handVisuals.forEach((visual) => {
    visual.line.visible = false;
    visual.cursor.visible = false;
  });

  if (!handVisualsVisible || renderer.xr.isPresenting) return;

  hands.slice(0, 2).forEach((hand, handIndex) => {
    const visual = handVisuals[handIndex];
    const positions = visual.line.geometry.attributes.position.array;
    let offset = 0;

    HAND_CONNECTIONS.forEach(([start, end]) => {
      const startDistance =
        0.82 + Math.max(-0.12, Math.min(0.20, -hand.points[start].z)) * 0.7;
      const endDistance =
        0.82 + Math.max(-0.12, Math.min(0.20, -hand.points[end].z)) * 0.7;
      const startPoint = pointOnViewRay(hand.points[start], startDistance);
      const endPoint = pointOnViewRay(hand.points[end], endDistance);

      positions[offset++] = startPoint.x;
      positions[offset++] = startPoint.y;
      positions[offset++] = startPoint.z;
      positions[offset++] = endPoint.x;
      positions[offset++] = endPoint.y;
      positions[offset++] = endPoint.z;
    });

    visual.line.geometry.attributes.position.needsUpdate = true;
    visual.line.visible = true;

    setRayFromLandmark(hand.points[8]);
    const hits = temp.raycaster.intersectObjects(interactiveObjects, true);
    const cursorPoint =
      hits[0]?.point || temp.raycaster.ray.at(0.92, new THREE.Vector3());

    visual.cursor.position.copy(cursorPoint);
    visual.cursor.scale.setScalar(hand.gesture.pinching ? 1.45 : 1);
    visual.cursor.material.color.set(
      hand.gesture.pinching ? 0xffe34e :
        handIndex === 0 ? 0x55ffad : 0x55b9ff
    );
    visual.cursor.visible = true;
  });
}

function refreshPanelTextures() {
  if (!searchFieldMesh) return;

  const owner = searchFieldMesh.userData.owner;
  updateButtonLabel(
    owner,
    browserQuery || "Toque e escreva com a mão",
    browserQuery ? "#202124" : "#788292"
  );

  suggestionMeshes.forEach((suggestion, index) => {
    const text = browserSuggestions[index];
    suggestion.visible = Boolean(text);
    if (text) {
      updateButtonLabel(
        suggestion,
        text.length > 40 ? `${text.slice(0, 39)}…` : text,
        "#39465a"
      );
    }
  });
}

function scheduleSuggestions() {
  localStorage.setItem("hf_browser_query", browserQuery);

  if (suggestionTimer) {
    clearTimeout(suggestionTimer);
  }

  if (browserQuery.trim().length < 2) {
    browserSuggestions = [];
    refreshPanelTextures();
    return;
  }

  suggestionTimer = setTimeout(async () => {
    try {
      const response = await fetch(
        `/api/suggest?q=${encodeURIComponent(browserQuery.trim())}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      browserSuggestions = Array.isArray(payload?.suggestions)
        ? payload.suggestions.slice(0, 3)
        : [];
    } catch (error) {
      console.warn("Sugestões indisponíveis.", error);
      browserSuggestions = [
        browserQuery,
        `${browserQuery} youtube`,
        `${browserQuery} imagens`
      ];
    }

    refreshPanelTextures();
  }, 300);
}

function handleKeyboardKey(key) {
  if (key === "⌫") {
    browserQuery = browserQuery.slice(0, -1);
  } else if (key === "ESPAÇO") {
    if (browserQuery && !browserQuery.endsWith(" ")) {
      browserQuery += " ";
    }
  } else if (key === "FECHAR") {
    keyboardVisible = false;
    keyboardRoot.visible = false;
    keyboardButton.textContent = "Teclado: OFF";
    return;
  } else if (key === "BUSCAR") {
    submitSearch(activeSearchMode);
    return;
  } else if (browserQuery.length < 100) {
    browserQuery += key.toLowerCase();
  }

  refreshPanelTextures();
  scheduleSuggestions();
}

function submitSearch(mode) {
  const query = browserQuery.trim();
  if (!query) {
    keyboardVisible = true;
    keyboardRoot.visible = true;
    keyboardButton.textContent = "Teclado: ON";
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

function activateAction(intersection) {
  const object = intersection.object;
  const action = object.userData.action;

  if (object === keyboardKeysMesh && intersection.instanceId !== undefined) {
    const key = keyboardKeyData[intersection.instanceId]?.key;
    if (key) handleKeyboardKey(key);
    return;
  }

  if (action === "focus-search") {
    keyboardVisible = true;
    keyboardRoot.visible = true;
    keyboardButton.textContent = "Teclado: ON";
    return;
  }

  if (action === "search-google") {
    submitSearch("google");
    return;
  }

  if (action === "search-images") {
    submitSearch("images");
    return;
  }

  if (action === "search-youtube") {
    submitSearch("youtube");
    return;
  }

  if (action?.startsWith("suggestion-")) {
    const index = Number(action.split("-")[1]);
    if (browserSuggestions[index]) {
      browserQuery = browserSuggestions[index];
      refreshPanelTextures();
      scheduleSuggestions();
      keyboardVisible = true;
      keyboardRoot.visible = true;
      keyboardButton.textContent = "Teclado: ON";
    }
    return;
  }

  if (action === "rotate-panel") {
    panelRoot.rotation.y += Math.PI / 4;
  }
}

function processHandInteractions(hands, now) {
  if (renderer.xr.isPresenting) return;

  const liveKeys = new Set(hands.map((hand) => hand.key));
  for (const [key] of handInteractionStates) {
    if (!liveKeys.has(key)) {
      handInteractionStates.delete(key);
    }
  }

  hands.forEach((hand) => {
    const state = handInteractionStates.get(hand.key) || {
      wasPinching: false,
      okStart: 0,
      okTriggered: false,
      dragging: false,
      dragDistance: 0,
      dragOffset: new THREE.Vector3()
    };

    setRayFromLandmark(hand.points[8]);
    const intersections = temp.raycaster.intersectObjects(
      interactiveObjects,
      true
    );
    const firstHit = intersections.find((hit) => hit.object.visible !== false);

    if (hand.gesture.okSign) {
      if (!state.okStart) state.okStart = now;

      if (!state.okTriggered && now - state.okStart > 520 && !firstHit) {
        keyboardVisible = !keyboardVisible;
        keyboardRoot.visible = keyboardVisible;
        keyboardButton.textContent =
          `Teclado: ${keyboardVisible ? "ON" : "OFF"}`;
        state.okTriggered = true;
      }
    } else {
      state.okStart = 0;
      state.okTriggered = false;
    }

    const pinchStarted = hand.gesture.pinching && !state.wasPinching;

    if (pinchStarted && firstHit) {
      if (firstHit.object.userData.action === "drag-panel") {
        state.dragging = true;
        state.dragDistance = temp.raycaster.ray.origin.distanceTo(
          firstHit.point
        );
        state.dragOffset.copy(firstHit.point).sub(panelRoot.position);
      } else {
        activateAction(firstHit);
      }
    }

    if (state.dragging) {
      if (hand.gesture.pinching) {
        const point = temp.raycaster.ray.at(
          state.dragDistance,
          temp.dragPoint
        );
        panelRoot.position.copy(point).sub(state.dragOffset);
      } else {
        state.dragging = false;
      }
    }

    state.wasPinching = hand.gesture.pinching;
    handInteractionStates.set(hand.key, state);
  });
}

function updateBackgroundPlane(eyeWidth, height) {
  if (!backgroundPlane || !video.videoWidth || !video.videoHeight) return;

  const sourceAspect = video.videoWidth / video.videoHeight;
  const targetAspect = eyeWidth / height;

  backgroundPlane.scale.set(1, 1, 1);

  if (sourceAspect > targetAspect) {
    backgroundPlane.scale.x = sourceAspect / targetAspect;
  } else {
    backgroundPlane.scale.y = targetAspect / sourceAspect;
  }
}

function configureEyeCamera(camera, horizontalOffset, eyeAspect) {
  camera.fov = 72;
  camera.aspect = eyeAspect;
  camera.near = 0.02;
  camera.far = 30;
  camera.position.copy(baseCamera.position);

  temp.vector
    .set(horizontalOffset, 0, 0)
    .applyQuaternion(baseCamera.quaternion);
  camera.position.add(temp.vector);
  camera.quaternion.copy(baseCamera.quaternion);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function renderNormalScene() {
  const width = canvas.width;
  const height = canvas.height;
  const eyeCount = vrMode ? 2 : 1;
  const eyeWidth = Math.floor(width / eyeCount);
  const eyeSeparation = Number(eyeSeparationInput.value);

  renderer.setScissorTest(true);

  for (let eye = 0; eye < eyeCount; eye += 1) {
    const x = eye * eyeWidth;
    renderer.setViewport(x, 0, eyeWidth, height);
    renderer.setScissor(x, 0, eyeWidth, height);
    renderer.clear(true, true, true);

    updateBackgroundPlane(eyeWidth, height);
    renderer.render(backgroundScene, backgroundCamera);
    renderer.clearDepth();

    const camera =
      eyeCount === 1
        ? baseCamera
        : eye === 0
          ? leftCamera
          : rightCamera;

    if (eyeCount === 1) {
      baseCamera.aspect = eyeWidth / height;
      baseCamera.updateProjectionMatrix();
    } else {
      configureEyeCamera(
        camera,
        eye === 0 ? -eyeSeparation / 2 : eyeSeparation / 2,
        eyeWidth / height
      );
    }

    renderer.render(scene, camera);
  }

  renderer.setScissorTest(false);
}

function updateFps(now) {
  const delta = Math.max(1, now - lastFpsAt);
  const instant = 1000 / delta;
  fpsAverage = fpsAverage
    ? fpsAverage * 0.88 + instant * 0.12
    : instant;
  lastFpsAt = now;
}

function updateHud(now) {
  if (now - lastHudAt < 250) return;
  lastHudAt = now;

  fpsLabel.textContent = `${Math.round(fpsAverage)} FPS`;
  handsLabel.textContent =
    `${preparedHands.length} ${preparedHands.length === 1 ? "mão" : "mãos"}`;

  if (!preparedHands.length) {
    gestureLabel.textContent = renderer.xr.isPresenting
      ? "AR 6DoF — câmera usada pelo ARCore"
      : "Sem mãos";
  } else {
    gestureLabel.textContent = preparedHands
      .map((hand) => {
        const label =
          hand.label === "Left" ? "Esquerda" :
          hand.label === "Right" ? "Direita" :
          hand.label;
        return `${label}: ${hand.gesture.name}`;
      })
      .join(" • ");
  }

  modeLabel.textContent = renderer.xr.isPresenting
    ? "AR 6DoF"
    : vrMode
      ? "VR 3D"
      : "3D";
}

async function checkARSupport() {
  if (!navigator.xr) {
    arButton.textContent = "AR 6DoF: indisponível";
    arButton.disabled = true;
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    arButton.disabled = !supported;
    arButton.textContent = supported
      ? "Entrar no AR 6DoF"
      : "AR 6DoF: incompatível";
  } catch {
    arButton.textContent = "AR 6DoF: incompatível";
    arButton.disabled = true;
  }
}

function placeRootInFrontOfXrViewer(frame) {
  if (!frame || !xrPlacementPending) return;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const pose = frame.getViewerPose(referenceSpace);
  const view = pose?.views?.[0];

  if (!view) return;

  const position = new THREE.Vector3(
    view.transform.position.x,
    view.transform.position.y,
    view.transform.position.z
  );
  const orientation = new THREE.Quaternion(
    view.transform.orientation.x,
    view.transform.orientation.y,
    view.transform.orientation.z,
    view.transform.orientation.w
  );
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);

  panelRoot.position.copy(position).addScaledVector(forward, 1.25);
  panelRoot.scale.setScalar(0.66);
  panelRoot.lookAt(position);
  xrPlacementPending = false;
}

async function enterAR() {
  if (!navigator.xr || arButton.disabled || xrSession) return;

  arButton.disabled = true;
  arButton.textContent = "Abrindo AR...";

  try {
    stopCamera();
    preparedHands = [];
    updateHandVisuals([]);

    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body }
    });

    xrSession = session;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);
    renderer.setClearAlpha(0);
    renderer.xr.setFoveation?.(1);
    xrPlacementPending = true;
    modeLabel.textContent = "AR 6DoF";

    session.addEventListener("end", async () => {
      xrSession = null;
      renderer.xr.enabled = false;
      renderer.setClearAlpha(0);
      panelRoot.scale.setScalar(1);
      recenter();

      arButton.disabled = false;
      arButton.textContent = "Entrar no AR 6DoF";

      if (!restartingAfterXR) {
        restartingAfterXR = true;
        try {
          await startCamera();
        } catch (error) {
          console.error(error);
          gestureLabel.textContent = "Falha ao reabrir câmera";
        } finally {
          restartingAfterXR = false;
        }
      }
    });
  } catch (error) {
    console.error(error);
    arButton.disabled = false;
    arButton.textContent = "Entrar no AR 6DoF";
    gestureLabel.textContent = "Não foi possível iniciar AR";

    try {
      await startCamera();
    } catch (cameraError) {
      console.error(cameraError);
    }
  }
}

function animationLoop(now, frame) {
  if (!running || !renderer) return;

  const profile = currentProfile();

  if (renderer.xr.isPresenting) {
    placeRootInFrontOfXrViewer(frame);
    renderer.render(scene, baseCamera);
    updateFps(now);
    updateHud(now);
    return;
  }

  const inferenceInterval = 1000 / profile.trackingFps;
  if (
    handLandmarker &&
    video.readyState >= 2 &&
    video.currentTime !== lastVideoTime &&
    now - lastInferenceAt >= inferenceInterval
  ) {
    lastInferenceAt = now;
    lastVideoTime = video.currentTime;

    try {
      const results = handLandmarker.detectForVideo(video, now);
      preparedHands = prepareHands(results);
    } catch (error) {
      console.error("Erro no rastreamento:", error);
    }
  }

  const renderInterval = 1000 / profile.renderFps;
  if (now - lastRenderAt < renderInterval) return;
  lastRenderAt = now;

  updateBaseCameraOrientation();
  processHandInteractions(preparedHands, now);
  updateHandVisuals(preparedHands);
  renderNormalScene();
  updateFps(now);
  updateHud(now);
}

async function applyPerformanceMode(mode, restart = false) {
  if (!PERFORMANCE_PROFILES[mode]) return;

  performanceMode = mode;
  performancePreset.value = mode;
  performanceButton.textContent =
    `Desempenho: ${currentProfile().label}`;
  document.body.classList.toggle("performance-lite", mode === "lite");
  resizeRenderer();

  if (!running || !restart || renderer.xr.isPresenting) return;

  gestureLabel.textContent = "Reconfigurando...";
  try {
    await Promise.all([createHandLandmarker(), startCamera()]);
  } catch (error) {
    console.error(error);
    gestureLabel.textContent = "Falha ao mudar desempenho";
  }
}

async function startExperience() {
  startButton.disabled = true;
  startButton.textContent = "Carregando...";

  try {
    performanceMode = performancePreset.value;
    document.body.classList.toggle(
      "performance-lite",
      performanceMode === "lite"
    );

    const orientationPromise = requestOrientationPermission();
    await loadLibraries();
    initializeThreeScene();

    await Promise.all([
      createHandLandmarker(),
      startCamera(),
      orientationPromise
    ]);

    await requestWakeLock();
    await checkARSupport();

    running = true;
    startPanel.classList.add("hidden");
    hud.classList.remove("hidden");
    controls.classList.remove("hidden");

    performanceButton.textContent =
      `Desempenho: ${currentProfile().label}`;
    resizeRenderer();
    scheduleSuggestions();
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Não foi possível iniciar.");
    startButton.textContent = "Tentar novamente";
    startButton.disabled = false;
  }
}

async function requestFullscreen() {
  try {
    const target = document.documentElement;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } catch (error) {
    console.warn("Tela cheia indisponível.", error);
  }

  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // iOS may deny orientation lock.
  }
}

startButton.addEventListener("click", startExperience);

vrButton.addEventListener("click", () => {
  vrMode = !vrMode;
  vrButton.textContent = `VR dividido: ${vrMode ? "ON" : "OFF"}`;
});

browserButton.addEventListener("click", () => {
  panelVisible = !panelVisible;
  panelRoot.visible = panelVisible;
  browserButton.textContent =
    `Painel Google: ${panelVisible ? "ON" : "OFF"}`;
});

keyboardButton.addEventListener("click", () => {
  keyboardVisible = !keyboardVisible;
  keyboardRoot.visible = keyboardVisible;
  keyboardButton.textContent =
    `Teclado: ${keyboardVisible ? "ON" : "OFF"}`;
});

handsButton.addEventListener("click", () => {
  handVisualsVisible = !handVisualsVisible;
  handsButton.textContent =
    `Mãos 3D: ${handVisualsVisible ? "ON" : "OFF"}`;
});

rotateButton.addEventListener("click", () => {
  panelRoot.rotation.y += Math.PI / 4;
});

recenterButton.addEventListener("click", recenter);
arButton.addEventListener("click", enterAR);

cameraButton.addEventListener("click", async () => {
  if (renderer.xr.isPresenting) return;
  facingMode = facingMode === "environment" ? "user" : "environment";
  smoothedHands.clear();

  try {
    await startCamera();
  } catch (error) {
    console.error(error);
    gestureLabel.textContent = "Erro ao trocar câmera";
  }
});

performanceButton.addEventListener("click", async () => {
  const modes = ["lite", "balanced", "quality"];
  const next = modes[(modes.indexOf(performanceMode) + 1) % modes.length];
  await applyPerformanceMode(next, true);
});

performancePreset.addEventListener("change", async () => {
  await applyPerformanceMode(performancePreset.value, running);
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

window.addEventListener("resize", resizeRenderer);
window.addEventListener("orientationchange", resizeRenderer);

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && running && !wakeLock) {
    await requestWakeLock();
  }
});

window.addEventListener("error", (event) => {
  console.error("Erro global:", event.error || event.message);
  if (!running) {
    setStatus(`Erro: ${event.message || "falha inesperada"}`);
    startButton.disabled = false;
    startButton.textContent = "Tentar novamente";
  }
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promessa rejeitada:", event.reason);
  if (!running) {
    setStatus(`Erro: ${event.reason?.message || "falha inesperada"}`);
    startButton.disabled = false;
    startButton.textContent = "Tentar novamente";
  }
});

performancePreset.value = performanceMode;
performanceButton.textContent =
  `Desempenho: ${currentProfile().label}`;
