import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Camera,
  RotateCcw,
  Maximize2,
  Minimize2,
  Box,
  AlertTriangle,
  ZoomIn,
} from "lucide-react";
import type { Snapshot, Parcel } from "./types";
import { fmt, clock } from "./components";

interface Conveyor3DProps {
  snapshot: Snapshot;
  onZone: (zone: number) => void;
  selected?: number;
  onSwitchTo2D?: () => void;
}

export function Conveyor3D({
  snapshot,
  onZone,
  selected,
  onSwitchTo2D,
}: Conveyor3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // References to preserve Three.js state across React re-renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqIdRef = useRef<number | null>(null);

  // Dynamic mesh references
  const parcelMeshesRef = useRef<Map<number, THREE.Group>>(new Map());
  const beltMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const motorMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const sensorLedsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const blockageMeshRef = useRef<THREE.Group | null>(null);
  const zoneClickTargetsRef = useRef<THREE.Mesh[]>([]);

  // Hover state
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<Parcel | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Latest snapshot ref for animation loop
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const onZoneRef = useRef(onZone);
  onZoneRef.current = onZone;

  // Layout calculation
  const zoneLengths = useMemo(() => {
    return snapshot.config?.lengths?.length === 3
      ? snapshot.config.lengths
      : [5, 5, 5];
  }, [snapshot.config?.lengths]);

  const totalLength = useMemo(
    () => zoneLengths.reduce((a, b) => a + b, 0),
    [zoneLengths]
  );

  // Create procedural belt texture with high-contrast slats and hazard borders
  const beltTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Dark rubber conveyor background
      ctx.fillStyle = "#1a2223";
      ctx.fillRect(0, 0, 512, 256);

      // Grooved rubber belt slats with bright highlights
      for (let y = 0; y < 256; y += 16) {
        ctx.fillStyle = "#334141";
        ctx.fillRect(0, y, 512, 6);
        ctx.fillStyle = "#101616";
        ctx.fillRect(0, y + 6, 512, 10);
      }

      // Yellow/black safety borders on belt edges
      ctx.fillStyle = "#facc15";
      ctx.fillRect(0, 0, 512, 14);
      ctx.fillRect(0, 242, 512, 14);

      // Diagonal safety stripes
      ctx.fillStyle = "#0f172a";
      for (let x = -20; x < 540; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 12, 0);
        ctx.lineTo(x + 6, 14);
        ctx.lineTo(x - 6, 14);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x, 242);
        ctx.lineTo(x + 12, 242);
        ctx.lineTo(x + 6, 256);
        ctx.lineTo(x - 6, 256);
        ctx.closePath();
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    return tex;
  }, []);

  // Safe helper to build a high-visibility, robust 3D Parcel Box
  const createParcelMesh = useCallback((p: Parcel, boxHeight: number, boxLength: number, boxWidth: number) => {
    const group = new THREE.Group();

    // 1. Warm, vibrant amber cardboard box
    const boxMat = new THREE.MeshStandardMaterial({
      color: "#d97706", // Bright amber cardboard
      roughness: 0.5,
      metalness: 0.05,
    });
    const boxGeo = new THREE.BoxGeometry(boxLength, boxHeight, boxWidth);
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    boxMesh.userData = { parcel: p };
    group.add(boxMesh);

    // 2. Crisp White Shipping Label on top of box
    const labelGeo = new THREE.PlaneGeometry(boxLength * 0.65, boxWidth * 0.55);
    const labelMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = boxHeight / 2 + 0.005;
    group.add(label);

    // 3. Black Barcode strip on top label
    const barGeo = new THREE.PlaneGeometry(boxLength * 0.45, boxWidth * 0.2);
    const barMat = new THREE.MeshBasicMaterial({
      color: "#0f172a",
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.y = boxHeight / 2 + 0.008;
    group.add(bar);

    // 4. Red Express/Priority tape on front face
    const tapeGeo = new THREE.PlaneGeometry(boxLength * 0.96, 0.09);
    const tapeMat = new THREE.MeshBasicMaterial({
      color: "#ef4444",
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.set(0, 0, boxWidth / 2 + 0.005);
    group.add(tape);

    // 5. Floating 3D Badge Sprite (Using 100% standard canvas fillRect, zero roundRect)
    const badgeCanvas = document.createElement("canvas");
    badgeCanvas.width = 128;
    badgeCanvas.height = 64;
    const bCtx = badgeCanvas.getContext("2d");
    if (bCtx) {
      // Solid bright emerald background
      bCtx.fillStyle = "#047857";
      bCtx.fillRect(0, 0, 128, 64);

      // Light border
      bCtx.strokeStyle = "#6ee7b7";
      bCtx.lineWidth = 6;
      bCtx.strokeRect(3, 3, 122, 58);

      // Text
      bCtx.fillStyle = "#ffffff";
      bCtx.font = "bold 24px monospace";
      bCtx.textAlign = "center";
      bCtx.textBaseline = "middle";
      bCtx.fillText(`📦 #${p.id}`, 64, 22);

      bCtx.fillStyle = "#a7f3d0";
      bCtx.font = "bold 16px monospace";
      bCtx.fillText(`${fmt(p.weight, 1)}kg`, 64, 46);
    }
    const badgeTex = new THREE.CanvasTexture(badgeCanvas);
    const badgeMat = new THREE.SpriteMaterial({
      map: badgeTex,
      depthTest: false,
    });
    const badgeSprite = new THREE.Sprite(badgeMat);
    badgeSprite.scale.set(0.68, 0.34, 1.0);
    badgeSprite.position.set(0, boxHeight / 2 + 0.32, 0);
    group.add(badgeSprite);

    return group;
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 440;

    // SCENE
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#090e10"); // High contrast dark slate
    scene.fog = new THREE.FogExp2("#090e10", 0.015);
    sceneRef.current = scene;

    // CAMERA - framed perfectly to show the full conveyor with large, clear parcels
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 3.5, 6.5);
    cameraRef.current = camera;

    // RENDERER
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    rendererRef.current = renderer;

    // ORBIT CONTROLS
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below floor
    controls.minDistance = 2.0;
    controls.maxDistance = 25;
    controls.target.set(0, 1.4, 0); // Aim directly at conveyor bed center
    controlsRef.current = controls;

    // LIGHTING - Studio quality industrial downlights
    const ambientLight = new THREE.AmbientLight("#d1fae5", 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight("#ffffff", 2.2);
    dirLight.position.set(10, 15, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 35;
    dirLight.shadow.camera.left = -totalLength;
    dirLight.shadow.camera.right = totalLength;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -8;
    dirLight.shadow.bias = -0.0003;
    scene.add(dirLight);

    // Warm high-contrast rim light from the front
    const frontFillLight = new THREE.DirectionalLight("#fed7aa", 1.2);
    frontFillLight.position.set(-8, 6, 10);
    scene.add(frontFillLight);

    // Direct overhead spotlights illuminating conveyor bed
    const overheadSpot = new THREE.SpotLight("#ffffff", 2.5);
    overheadSpot.position.set(0, 7.5, 0);
    overheadSpot.target.position.set(0, 1.4, 0);
    overheadSpot.angle = Math.PI / 3;
    overheadSpot.penumbra = 0.4;
    scene.add(overheadSpot);
    scene.add(overheadSpot.target);

    // INDUSTRIAL FLOOR WITH SUBTLE GRID
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshStandardMaterial({
      color: "#0b1113",
      roughness: 0.8,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid helper on floor
    const gridHelper = new THREE.GridHelper(40, 40, "#142d2a", "#0e1d1c");
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // BUILD STATIC CONVEYOR STRUCTURE
    const beltHeight = 1.4; // Height of conveyor bed above floor
    const beltWidth = 1.15; // Width of belt
    const frameDepth = 1.38; // Outer frame width

    // Materials
    const metalMat = new THREE.MeshStandardMaterial({
      color: "#243133",
      roughness: 0.35,
      metalness: 0.85,
    });
    const backRailMat = new THREE.MeshStandardMaterial({
      color: "#37474a",
      roughness: 0.3,
      metalness: 0.9,
    });
    // TRANSPARENT ACRYLIC / POLYCARBONATE FRONT GUARD RAIL
    // Guaranteed transparent across all WebGL engines (no transmission pass required)
    const frontAcrylicMat = new THREE.MeshStandardMaterial({
      color: "#14b8a6",
      transparent: true,
      opacity: 0.22,
      roughness: 0.2,
      metalness: 0.1,
    });
    const railTopTrimMat = new THREE.MeshStandardMaterial({
      color: "#087f73",
      roughness: 0.3,
      metalness: 0.8,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: "#182224",
      roughness: 0.6,
      metalness: 0.8,
    });
    const rollerMat = new THREE.MeshStandardMaterial({
      color: "#71858a",
      roughness: 0.2,
      metalness: 0.95,
    });

    // Reset references
    beltMaterialsRef.current = [];
    motorMaterialsRef.current = [];
    sensorLedsRef.current = [];
    zoneClickTargetsRef.current = [];
    parcelMeshesRef.current.clear();

    let currentX = -totalLength / 2;

    zoneLengths.forEach((len, idx) => {
      const zoneGroup = new THREE.Group();
      zoneGroup.name = `zone_${idx}`;

      const zoneCenterX = currentX + len / 2;

      // 1. Moving Belt Surface
      const beltMat = new THREE.MeshStandardMaterial({
        map: beltTexture.clone(),
        roughness: 0.6,
        metalness: 0.15,
      });
      beltMat.map!.repeat.set(len * 1.5, 1);
      beltMaterialsRef.current.push(beltMat);

      const beltGeo = new THREE.BoxGeometry(len - 0.08, 0.08, beltWidth);
      const beltMesh = new THREE.Mesh(beltGeo, beltMat);
      beltMesh.position.set(zoneCenterX, beltHeight, 0);
      beltMesh.receiveShadow = true;
      zoneGroup.add(beltMesh);

      // 2. Zone Click / Hover Invisible Hitbox
      const hitGeo = new THREE.BoxGeometry(len, 2.0, frameDepth + 0.6);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set(zoneCenterX, beltHeight + 0.5, 0);
      hitMesh.userData = { zoneIndex: idx };
      zoneGroup.add(hitMesh);
      zoneClickTargetsRef.current.push(hitMesh);

      // 3. Side Guide Rails:
      // Front rail: Transparent acrylic safety shield (parcels 100% visible through it!)
      const railGeo = new THREE.BoxGeometry(len - 0.04, 0.2, 0.04);
      const frontRail = new THREE.Mesh(railGeo, frontAcrylicMat);
      frontRail.position.set(zoneCenterX, beltHeight + 0.09, beltWidth / 2 + 0.03);
      zoneGroup.add(frontRail);

      // Front rail metallic top edge
      const trimGeo = new THREE.BoxGeometry(len - 0.04, 0.025, 0.05);
      const frontTrim = new THREE.Mesh(trimGeo, railTopTrimMat);
      frontTrim.position.set(zoneCenterX, beltHeight + 0.19, beltWidth / 2 + 0.03);
      zoneGroup.add(frontTrim);

      // Back rail: Industrial steel extrusion
      const backRail = new THREE.Mesh(railGeo, backRailMat);
      backRail.position.set(zoneCenterX, beltHeight + 0.09, -(beltWidth / 2 + 0.03));
      backRail.castShadow = true;
      backRail.receiveShadow = true;
      zoneGroup.add(backRail);

      // 4. End Rollers
      [currentX + 0.08, currentX + len - 0.08].forEach((rx) => {
        const cylGeo = new THREE.CylinderGeometry(0.08, 0.08, beltWidth + 0.02, 16);
        cylGeo.rotateX(Math.PI / 2);
        const roller = new THREE.Mesh(cylGeo, rollerMat);
        roller.position.set(rx, beltHeight - 0.02, 0);
        roller.castShadow = true;
        zoneGroup.add(roller);
      });

      // 5. Conveyor Structural Tray
      const trayGeo = new THREE.BoxGeometry(len - 0.02, 0.16, frameDepth);
      const tray = new THREE.Mesh(trayGeo, metalMat);
      tray.position.set(zoneCenterX, beltHeight - 0.1, 0);
      tray.castShadow = true;
      tray.receiveShadow = true;
      zoneGroup.add(tray);

      // 6. Support Legs
      const legPositions = [currentX + 0.4, currentX + len - 0.4];
      legPositions.forEach((lx) => {
        [-beltWidth / 2 - 0.05, beltWidth / 2 + 0.05].forEach((lz) => {
          const colGeo = new THREE.BoxGeometry(0.09, beltHeight - 0.18, 0.09);
          const col = new THREE.Mesh(colGeo, legMat);
          col.position.set(lx, (beltHeight - 0.18) / 2, lz);
          col.castShadow = true;
          zoneGroup.add(col);

          const footGeo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
          const foot = new THREE.Mesh(footGeo, metalMat);
          foot.position.set(lx, 0.02, lz);
          zoneGroup.add(foot);
        });

        const crossGeo = new THREE.BoxGeometry(0.06, 0.06, beltWidth + 0.1);
        const cross = new THREE.Mesh(crossGeo, legMat);
        cross.position.set(lx, (beltHeight - 0.18) * 0.4, 0);
        cross.castShadow = true;
        zoneGroup.add(cross);
      });

      // 7. Electric Drive Motor Assembly
      const motorGroup = new THREE.Group();
      motorGroup.position.set(zoneCenterX, beltHeight - 0.2, -(frameDepth / 2 + 0.25));

      const motorMat = new THREE.MeshStandardMaterial({
        color: "#23403c",
        roughness: 0.4,
        metalness: 0.7,
        emissive: new THREE.Color("#000000"),
      });
      motorMaterialsRef.current.push(motorMat);

      const motorCylGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.42, 24);
      motorCylGeo.rotateZ(Math.PI / 2);
      const motorCyl = new THREE.Mesh(motorCylGeo, motorMat);
      motorCyl.castShadow = true;
      motorGroup.add(motorCyl);

      const gearGeo = new THREE.BoxGeometry(0.25, 0.3, 0.25);
      const gear = new THREE.Mesh(gearGeo, metalMat);
      gear.position.set(0.24, 0, 0);
      gear.castShadow = true;
      motorGroup.add(gear);

      zoneGroup.add(motorGroup);

      // 8. Overhead Sensor Beam Arch
      const archX = currentX + len * 0.85;
      const archGroup = new THREE.Group();
      archGroup.position.set(archX, beltHeight, 0);

      [-beltWidth / 2 - 0.08, beltWidth / 2 + 0.08].forEach((az) => {
        const postGeo = new THREE.BoxGeometry(0.05, 0.95, 0.05);
        const post = new THREE.Mesh(postGeo, metalMat);
        post.position.set(0, 0.47, az);
        archGroup.add(post);
      });

      const topBeamGeo = new THREE.BoxGeometry(0.06, 0.05, beltWidth + 0.22);
      const topBeam = new THREE.Mesh(topBeamGeo, metalMat);
      topBeam.position.set(0, 0.95, 0);
      archGroup.add(topBeam);

      const ledGeo = new THREE.SphereGeometry(0.07, 16, 16);
      const ledMat = new THREE.MeshBasicMaterial({ color: "#10b981" });
      sensorLedsRef.current.push(ledMat);

      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, 1.05, beltWidth / 2 + 0.08);
      archGroup.add(led);

      zoneGroup.add(archGroup);

      scene.add(zoneGroup);
      currentX += len;
    });

    // 9. Upstream Infeed Ramp / Buffer Chute
    const infeedRampGroup = new THREE.Group();
    const startX = -totalLength / 2;
    const rampGeo = new THREE.BoxGeometry(1.6, 0.08, beltWidth);
    const rampMat = new THREE.MeshStandardMaterial({
      color: "#1e282a",
      roughness: 0.5,
      metalness: 0.6,
    });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(startX - 0.75, beltHeight + 0.2, 0);
    ramp.rotation.z = 0.24;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    infeedRampGroup.add(ramp);

    scene.add(infeedRampGroup);

    // 10. Downstream Outfeed Roller Runout
    const outfeedGroup = new THREE.Group();
    const endX = totalLength / 2;
    const runoutGeo = new THREE.BoxGeometry(1.5, 0.08, beltWidth);
    const runout = new THREE.Mesh(runoutGeo, rampMat);
    runout.position.set(endX + 0.72, beltHeight - 0.02, 0);
    runout.castShadow = true;
    runout.receiveShadow = true;
    outfeedGroup.add(runout);

    scene.add(outfeedGroup);

    // 11. Blockage Barrier
    const blockageGroup = new THREE.Group();
    blockageGroup.position.set(endX - 0.25, beltHeight + 0.28, 0);
    blockageGroup.visible = false;

    const gateGeo = new THREE.BoxGeometry(0.14, 0.5, beltWidth + 0.1);
    const gateMat = new THREE.MeshStandardMaterial({
      color: "#ef4444",
      roughness: 0.3,
      metalness: 0.5,
    });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.castShadow = true;
    blockageGroup.add(gateMesh);

    const strobeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.18, 16);
    const strobeMat = new THREE.MeshBasicMaterial({ color: "#ff2222" });
    const strobe = new THREE.Mesh(strobeGeo, strobeMat);
    strobe.position.set(0, 0.34, 0);
    blockageGroup.add(strobe);

    scene.add(blockageGroup);
    blockageMeshRef.current = blockageGroup;

    // RESIZE OBSERVER
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // RAYCASTER FOR HOVER & CLICK
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.set(x, y);

      setMousePos({ x: e.clientX, y: e.clientY });

      if (!cameraRef.current) return;
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Check parcel hover first
      const parcelMeshes = Array.from(parcelMeshesRef.current.values()).map(
        (g) => g.children[0] as THREE.Mesh
      );
      const parcelHits = raycaster.intersectObjects(parcelMeshes, false);
      if (parcelHits.length > 0) {
        const hitParcel = parcelHits[0].object.userData.parcel as Parcel;
        setHoveredParcel(hitParcel || null);
        canvas.style.cursor = "pointer";
        return;
      } else {
        setHoveredParcel(null);
      }

      // Check zone hover
      const zoneHits = raycaster.intersectObjects(zoneClickTargetsRef.current, false);
      if (zoneHits.length > 0) {
        const hitZoneIdx = zoneHits[0].object.userData.zoneIndex as number;
        setHoveredZone(hitZoneIdx);
        canvas.style.cursor = "pointer";
      } else {
        setHoveredZone(null);
        canvas.style.cursor = "grab";
      }
    };

    const handlePointerDown = () => {
      canvas.style.cursor = "grabbing";
    };

    const handlePointerUp = () => {
      canvas.style.cursor = "grab";
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.set(x, y);

      if (!cameraRef.current) return;
      raycaster.setFromCamera(mouse, cameraRef.current);

      const zoneHits = raycaster.intersectObjects(zoneClickTargetsRef.current, false);
      if (zoneHits.length > 0) {
        const hitZoneIdx = zoneHits[0].object.userData.zoneIndex as number;
        onZoneRef.current(hitZoneIdx);
      }
    };

    canvas.addEventListener("mousemove", handlePointerMove);
    canvas.addEventListener("mousedown", handlePointerDown);
    canvas.addEventListener("mouseup", handlePointerUp);
    canvas.addEventListener("click", handleClick);

    // RENDER & 60-FPS CONTINUOUS SIMULATION SYNC LOOP
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      reqIdRef.current = requestAnimationFrame(animate);

      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const currentSnapshot = snapshotRef.current;
      const isRunning = currentSnapshot.state === "running";

      // 1. Animate belt texture scrolling based on speed
      if (currentSnapshot.zones && currentSnapshot.zones.length === 3) {
        currentSnapshot.zones.forEach((z, i) => {
          const mat = beltMaterialsRef.current[i];
          if (mat && mat.map) {
            const speed = isRunning ? z.speed : 0;
            mat.map.offset.x = (mat.map.offset.x - speed * dt * 0.4) % 1;
          }
        });
      }

      // 2. Animate motor thermal glow
      if (currentSnapshot.zones) {
        currentSnapshot.zones.forEach((z, i) => {
          const motorMat = motorMaterialsRef.current[i];
          if (motorMat) {
            const temp = z.temperature ?? 25;
            if (temp > 50) {
              const intensity = Math.min(1, (temp - 50) / 25);
              motorMat.emissive.setRGB(intensity * 0.9, intensity * 0.25, 0);
            } else {
              motorMat.emissive.setRGB(0, 0, 0);
            }
          }
        });
      }

      // 3. Sensor LEDs and blockage gate
      const hasBlockage = currentSnapshot.faults.some((f) => f.kind === "blockage");
      if (blockageMeshRef.current) {
        blockageMeshRef.current.visible = hasBlockage;
      }

      sensorLedsRef.current.forEach((ledMat, i) => {
        const isBlocked = i === 2 && hasBlockage;
        if (isBlocked) {
          const flash = Math.sin(currentTime * 0.008) > 0;
          ledMat.color.set(flash ? "#ef4444" : "#450a0a");
        } else if (isRunning) {
          ledMat.color.set("#10b981");
        } else {
          ledMat.color.set("#64748b");
        }
      });

      // 4. PARCEL 60-FPS REAL-TIME SYNC & POSITIONING DIRECTLY IN ENGINE
      if (currentSnapshot.zones && currentSnapshot.zones.length > 0) {
        const parcelMap = parcelMeshesRef.current;
        const activeIds = new Set<number>();
        let zoneStartX = -totalLength / 2;

        currentSnapshot.zones.forEach((zone) => {
          const zoneLen = zone.length;
          zone.parcels.forEach((p) => {
            activeIds.add(p.id);

            // Compute exact 3D position
            const posX = zoneStartX + (p.position / zoneLen) * zoneLen;
            const boxLength = Math.max(0.65, Math.min(1.3, p.length * 2.0));
            const boxWidth = 0.76;
            const boxHeight = Math.max(0.46, Math.min(0.85, p.weight * 0.05 + 0.38));
            const posY = beltHeight + 0.04 + boxHeight / 2;

            let group = parcelMap.get(p.id);
            if (!group) {
              group = createParcelMesh(p, boxHeight, boxLength, boxWidth);
              scene.add(group);
              parcelMap.set(p.id, group);
            }

            // Direct update of position every frame
            group.position.set(posX, posY, 0);
          });

          zoneStartX += zoneLen;
        });

        // Clean up departed parcels
        parcelMap.forEach((group, id) => {
          if (!activeIds.has(id)) {
            scene.remove(group);
            parcelMap.delete(id);
          }
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };

    reqIdRef.current = requestAnimationFrame(animate);

    // CLEANUP
    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener("mousemove", handlePointerMove);
      canvas.removeEventListener("mousedown", handlePointerDown);
      canvas.removeEventListener("mouseup", handlePointerUp);
      canvas.removeEventListener("click", handleClick);
      renderer.dispose();
    };
  }, [totalLength, zoneLengths, beltTexture, createParcelMesh]);

  // Camera presets
  const setCameraView = useCallback(
    (view: "close" | "iso" | "top" | "side" | "reset") => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      if (view === "close") {
        camera.position.set(0, 2.4, 3.8);
        controls.target.set(0, 1.4, 0);
      } else if (view === "iso" || view === "reset") {
        camera.position.set(0, 3.5, 6.5);
        controls.target.set(0, 1.4, 0);
      } else if (view === "top") {
        camera.position.set(0, 8.0, 0.01);
        controls.target.set(0, 1.4, 0);
      } else if (view === "side") {
        camera.position.set(0, 2.0, 6.0);
        controls.target.set(0, 1.4, 0);
      }
      controls.update();
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-border/80 bg-[#090e10] select-none transition-all ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : "h-[440px]"
      }`}
    >
      {/* Three.js WebGL Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block outline-none" />

      {/* TOP HEADER OVERLAY */}
      <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#132322]/90 border border-[#087f73]/40 text-[#4ade80] text-[11px] font-mono tracking-wider shadow-sm backdrop-blur-md">
            <span
              className={`w-2 h-2 rounded-full ${
                snapshot.state === "running"
                  ? "bg-emerald-400 animate-pulse"
                  : snapshot.state === "emergency"
                    ? "bg-red-500 animate-ping"
                    : "bg-slate-400"
              }`}
            />
            {snapshot.state.toUpperCase()} · 3D TWIN
          </span>
          {onSwitchTo2D && (
            <div className="inline-flex rounded-md p-0.5 bg-black/60 border border-white/10 backdrop-blur-md">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#087f73] text-white font-medium">
                3D
              </span>
              <button
                type="button"
                onClick={onSwitchTo2D}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Switch to 2D Blueprint"
              >
                2D
              </button>
            </div>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/50 border border-white/10 text-slate-300 text-[11px] font-mono backdrop-blur-md">
            FLOW: L → R
          </span>
        </div>

        {/* 3D Camera & Control Toolbar */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-black/60 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => setCameraView("close")}
            title="Close-Up on Parcels"
            className="px-2 py-1 text-[11px] font-medium text-emerald-300 hover:text-white hover:bg-emerald-800/40 rounded transition-colors flex items-center gap-1 font-mono"
          >
            <ZoomIn size={13} />
            <span className="hidden md:inline">Zoom In</span>
          </button>
          <button
            type="button"
            onClick={() => setCameraView("iso")}
            title="Isometric 3D Perspective"
            className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors flex items-center gap-1"
          >
            <Camera size={13} />
            <span className="hidden md:inline">Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setCameraView("top")}
            title="Top-Down 2D Plane"
            className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Top
          </button>
          <button
            type="button"
            onClick={() => setCameraView("side")}
            title="Side Profile"
            className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Side
          </button>
          <button
            type="button"
            onClick={() => setCameraView("reset")}
            title="Reset Camera Angle"
            className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
            className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* EMERGENCY STOP NOTICE BANNER */}
      {snapshot.state === "emergency" && (
        <div className="absolute top-14 left-4 right-4 flex items-center justify-center pointer-events-none z-10">
          <div className="px-3.5 py-1.5 rounded-lg bg-red-950/90 border border-red-500/60 text-red-200 text-[11px] font-mono shadow-xl backdrop-blur-md flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span>
              EMERGENCY STOP LATCHED: Click <strong>"Clear stop"</strong> button above to release the safety latch, then click <strong>"Start line"</strong>.
            </span>
          </div>
        </div>
      )}

      {/* ZONE INTERACTIVE PILL BUTTONS */}
      <div className="absolute bottom-11 left-4 right-4 flex items-center justify-center gap-2 pointer-events-none">
        {snapshot.zones.map((zone, idx) => {
          const reading = snapshot.observation?.zones[idx];
          const isSelected = selected === idx;
          const isHovered = hoveredZone === idx;
          const isBlocked =
            idx === 2 && snapshot.faults.some((f) => f.kind === "blockage");

          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onZone(idx)}
              className={`pointer-events-auto px-3 py-1.5 rounded-lg border text-left backdrop-blur-md transition-all shadow-md flex items-center gap-2.5 ${
                isSelected
                  ? "bg-[#087f73]/80 border-[#14b8a6] text-white ring-2 ring-[#14b8a6]/40"
                  : isHovered
                    ? "bg-slate-800/90 border-slate-500 text-white"
                    : "bg-slate-900/80 border-slate-700/60 text-slate-300 hover:bg-slate-800/90"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-75">
                  0{idx + 1} {zone.name}
                </span>
                <span className="text-[11px] font-semibold flex items-center gap-1.5 font-mono">
                  {isBlocked ? (
                    <span className="text-red-400 flex items-center gap-0.5">
                      <AlertTriangle size={11} /> BLOCKED
                    </span>
                  ) : (
                    <>
                      {fmt(reading?.speed ?? zone.speed, 2)} m/s ·{" "}
                      <span className="text-emerald-400">{zone.parcels.length} pkgs</span>
                    </>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* FOOTER BAR */}
      <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between pointer-events-none text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                snapshot.state === "running" ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            {snapshot.state === "running" ? "Belt in motion" : "Stationary"}
          </span>
          <span>•</span>
          <span>{snapshot.waiting} waiting upstream</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-slate-500">
          <span>Rotate: Left Click · Pan: Right Click · Zoom: Scroll</span>
          <span>•</span>
          <span>{clock(snapshot.simulation_time)}</span>
        </div>
      </div>

      {/* PARCEL HOVER TOOLTIP */}
      {hoveredParcel && mousePos && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-slate-900/95 border border-emerald-500/50 text-white shadow-2xl text-[11px] font-mono flex flex-col gap-1 backdrop-blur-md"
          style={{
            left: `${mousePos.x + 14}px`,
            top: `${mousePos.y + 14}px`,
          }}
        >
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
            <Box size={14} />
            EXPRESS PARCEL #{hoveredParcel.id}
          </div>
          <div>Zone: {snapshot.zones[hoveredParcel.zone]?.name || hoveredParcel.zone}</div>
          <div>Length: {fmt(hoveredParcel.length, 2)} m</div>
          <div>Weight: {fmt(hoveredParcel.weight, 1)} kg</div>
        </div>
      )}
    </div>
  );
}
