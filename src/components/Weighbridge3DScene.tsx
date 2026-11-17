import { Orbit, RotateCcw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import heroPoster from '../assets/images/hero_ewaste_hub_1794898241189.jpg';

export type Material3DKey = 'copper' | 'pcb' | 'aluminium' | 'battery';

interface MaterialMeta {
  key: Material3DKey;
  label: string;
  shortLabel: string;
  defaultRate: number;
  co2Factor: number;
}

export const MATERIAL_3D_LIST: MaterialMeta[] = [
  { key: 'copper', label: 'Copper Wires & Cables', shortLabel: 'Copper', defaultRate: 640, co2Factor: 3.8 },
  { key: 'pcb', label: 'Printed Circuit Boards', shortLabel: 'PCBs', defaultRate: 480, co2Factor: 5.2 },
  { key: 'aluminium', label: 'Aluminium Scrap', shortLabel: 'Aluminium', defaultRate: 185, co2Factor: 9.1 },
  { key: 'battery', label: 'Lead & Li-Ion Batteries', shortLabel: 'Batteries', defaultRate: 135, co2Factor: 2.9 },
];

interface Weighbridge3DSceneProps {
  selectedMaterial: Material3DKey;
  onSelectMaterial: (key: Material3DKey) => void;
  weightKg: number;
  ratePerKg: number;
  displayLabel?: string;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPcbTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0d5336';
    ctx.fillRect(0, 0, 512, 512);

    // Copper ground plane grid
    ctx.strokeStyle = 'rgba(28, 125, 82, 0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Gold plated circuit traces
    ctx.strokeStyle = '#e6b84c';
    ctx.lineWidth = 4;
    for (let r = 48; r < 470; r += 44) {
      ctx.beginPath();
      ctx.moveTo(32, r);
      ctx.lineTo(140 + (r % 90), r);
      ctx.lineTo(190 + (r % 90), r + 22);
      ctx.lineTo(476, r + 22);
      ctx.stroke();

      // Solder pads
      ctx.fillStyle = '#f5d276';
      ctx.beginPath();
      ctx.arc(32, r, 6, 0, Math.PI * 2);
      ctx.arc(476, r + 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Silkscreen markings
    ctx.fillStyle = '#eaf7f0';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('E-WASTE GRADE A · PCB', 36, 468);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createHazardStripeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#18181b';
    for (let x = -128; x < 640; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x - 16, 128);
      ctx.lineTo(x - 48, 128);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function drawDisplayScreen(
  canvas: HTMLCanvasElement,
  materialLabel: string,
  weightKg: number,
  ratePerKg: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#091410';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle glass border
  ctx.strokeStyle = '#1f4d3a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = 'bold 22px monospace';
  const trimmedLabel =
    materialLabel.length > 26 ? `${materialLabel.slice(0, 25)}…` : materialLabel;
  ctx.fillText(trimmedLabel.toUpperCase(), 26, 44);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 74px monospace';
  ctx.fillText(`${weightKg.toFixed(1)} kg`, 26, 128);

  const total = Math.round(weightKg * ratePerKg);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 28px monospace';
  ctx.fillText(`EST ₹${total.toLocaleString('en-IN')}`, 26, 180);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 18px monospace';
  ctx.fillText(`@ ₹${ratePerKg}/kg REF`, 280, 180);
}

function createRoundedPlateGeometry(width: number, depth: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const hw = width / 2 - radius;
  const hd = depth / 2 - radius;
  shape.moveTo(-hw, -depth / 2);
  shape.lineTo(hw, -depth / 2);
  shape.quadraticCurveTo(width / 2, -depth / 2, width / 2, -hd);
  shape.lineTo(width / 2, hd);
  shape.quadraticCurveTo(width / 2, depth / 2, hw, depth / 2);
  shape.lineTo(-hw, depth / 2);
  shape.quadraticCurveTo(-width / 2, depth / 2, -width / 2, hd);
  shape.lineTo(-width / 2, -hd);
  shape.quadraticCurveTo(-width / 2, -depth / 2, -hw, -depth / 2);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export const Weighbridge3DScene: React.FC<Weighbridge3DSceneProps> = ({
  selectedMaterial,
  onSelectMaterial,
  weightKg,
  ratePerKg,
  displayLabel,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  const stateRef = useRef({
    selectedMaterial,
    weightKg,
    ratePerKg,
    displayLabel,
    resetRequested: false,
  });

  useEffect(() => {
    stateRef.current.selectedMaterial = selectedMaterial;
    stateRef.current.weightKg = weightKg;
    stateRef.current.ratePerKg = ratePerKg;
    stateRef.current.displayLabel = displayLabel;
  }, [selectedMaterial, weightKg, ratePerKg, displayLabel]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let cleanupScene: (() => void) | null = null;

    const initTimer = window.setTimeout(() => {
      if (disposed || !mountRef.current) return;
      cleanupScene = initScene(mountRef.current);
    }, 120);

    function initScene(host: HTMLDivElement): (() => void) | null {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const isSoftwareGl = detectSoftwareGl();

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          alpha: false,
        });
      } catch {
        setWebglUnavailable(true);
        return null;
      }

      const width = Math.max(host.clientWidth, 300);
      const height = Math.max(host.clientHeight, 260);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color('#0c1713');
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x0c1713, 0.055);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    const defaultCamPos = new THREE.Vector3(3.4, 2.55, 4.1);
    const defaultTarget = new THREE.Vector3(0, 0.72, 0);
    camera.position.copy(defaultCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultTarget);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.8;
    controls.maxDistance = 7.5;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.autoRotate = !prefersReduced && !isSoftwareGl;
    controls.autoRotateSpeed = 0.9;
    controls.update();

    let userInteracting = false;
    const onControlStart = () => {
      userInteracting = true;
      controls.autoRotate = false;
    };
    controls.addEventListener('start', onControlStart);

    // 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xbfd8e6, 0x1e2621, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(4.5, 6.5, 4.0);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 18;
      keyLight.shadow.camera.left = -3.5;
      keyLight.shadow.camera.right = 3.5;
      keyLight.shadow.camera.top = 3.5;
      keyLight.shadow.camera.bottom = -3.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6ee7b7, 1.15);
    rimLight.position.set(-4.0, 3.2, -3.5);
    scene.add(rimLight);

    // Track disposable resources
    const disposables: Array<{ dispose: () => void }> = [envTarget];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Studio floor + soft contact shadow
    const floorGeo = track(new THREE.CircleGeometry(9, 48));
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x101e19,
        roughness: 0.88,
        metalness: 0.12,
      })
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.01;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    const shadowTex = track(createContactShadowTexture());
    const contactShadowGeo = track(new THREE.PlaneGeometry(3.8, 3.8));
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      })
    );
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    // =====================================================
    // Composite Digital Weighbridge Platform (7 parts)
    // =====================================================
    const scaleGroup = new THREE.Group();
    scene.add(scaleGroup);

    const rubberMat = track(
      new THREE.MeshStandardMaterial({ color: 0x181c1b, roughness: 0.88, metalness: 0.05 })
    );
    const steelFrameMat = track(
      new THREE.MeshStandardMaterial({ color: 0x26322d, roughness: 0.42, metalness: 0.72 })
    );
    const brushedSteelMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.92,
        roughness: 0.22,
        envMapIntensity: 1.25,
      })
    );
    const copperAccentMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xb04a17,
        metalness: 0.72,
        roughness: 0.28,
        envMapIntensity: 1.2,
      })
    );

    // 4 rubberized load-cell feet resting flush at y = 0
    const footGeo = track(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 20));
    const footOffsets: [number, number][] = [
      [-1.05, -0.82],
      [1.05, -0.82],
      [-1.05, 0.82],
      [1.05, 0.82],
    ];
    for (const [fx, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, rubberMat);
      foot.position.set(fx, 0.04, fz);
      foot.castShadow = !isSoftwareGl;
      scaleGroup.add(foot);
    }

    // Beveled dark steel base chassis
    const basePlateGeo = track(createRoundedPlateGeometry(2.45, 1.95, 0.12, 0.14));
    const basePlate = new THREE.Mesh(basePlateGeo, steelFrameMat);
    basePlate.position.y = 0.08;
    basePlate.castShadow = !isSoftwareGl;
    basePlate.receiveShadow = !isSoftwareGl;
    scaleGroup.add(basePlate);

    // Spring-loaded stainless steel weighing platter
    const deckGroup = new THREE.Group();
    deckGroup.position.y = 0.24;
    scaleGroup.add(deckGroup);

    const deckGeo = track(createRoundedPlateGeometry(2.15, 1.68, 0.06, 0.1));
    const deckMesh = new THREE.Mesh(deckGeo, brushedSteelMat);
    deckMesh.castShadow = !isSoftwareGl;
    deckMesh.receiveShadow = !isSoftwareGl;
    deckGroup.add(deckMesh);

    // Copper weighbridge calibration rim accent
    const trimGeo = track(createRoundedPlateGeometry(2.22, 1.75, 0.025, 0.11));
    const trimMesh = new THREE.Mesh(trimGeo, copperAccentMat);
    trimMesh.position.y = -0.015;
    deckGroup.add(trimMesh);

    // Rear Weighbridge Column & Angled Digital Display Head
    const pillarGeo = track(new THREE.CylinderGeometry(0.055, 0.065, 1.48, 20));
    const pillar = new THREE.Mesh(pillarGeo, brushedSteelMat);
    pillar.position.set(0, 0.82, -1.04);
    pillar.castShadow = !isSoftwareGl;
    scaleGroup.add(pillar);

    const headHousingGeo = track(new THREE.BoxGeometry(1.18, 0.56, 0.16));
    const headHousing = new THREE.Mesh(headHousingGeo, steelFrameMat);
    headHousing.position.set(0, 1.58, -0.98);
    headHousing.rotation.x = 0.22;
    headHousing.castShadow = !isSoftwareGl;
    scaleGroup.add(headHousing);

    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = 512;
    displayCanvas.height = 224;
    drawDisplayScreen(
      displayCanvas,
      'Copper',
      stateRef.current.weightKg,
      stateRef.current.ratePerKg
    );
    const displayTex = track(new THREE.CanvasTexture(displayCanvas));
    displayTex.colorSpace = THREE.SRGBColorSpace;
    displayTex.anisotropy = maxAniso;

    const screenGeo = track(new THREE.PlaneGeometry(1.06, 0.46));
    const screenMat = track(
      new THREE.MeshBasicMaterial({
        map: displayTex,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 1.58, -0.895);
    screenMesh.rotation.x = 0.22;
    scaleGroup.add(screenMesh);

    // =====================================================
    // 4 Multi-Part Procedural E-Waste Material Assemblies
    // =====================================================
    const materialGroups: Record<Material3DKey, THREE.Group> = {
      copper: new THREE.Group(),
      pcb: new THREE.Group(),
      aluminium: new THREE.Group(),
      battery: new THREE.Group(),
    };

    // 1. COPPER WIRES & COILS (7 parts)
    {
      const g = materialGroups.copper;
      const bareCopperMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xd46a34,
          metalness: 0.94,
          roughness: 0.2,
          envMapIntensity: 1.25,
        })
      );
      const darkInsulationMat = track(
        new THREE.MeshStandardMaterial({ color: 0x1d2321, roughness: 0.78, metalness: 0.05 })
      );
      const terracottaSleeveMat = track(
        new THREE.MeshStandardMaterial({ color: 0x9c3d12, roughness: 0.65, metalness: 0.08 })
      );

      const coilMainGeo = track(new THREE.TorusGeometry(0.46, 0.12, 20, 48));
      coilMainGeo.rotateX(Math.PI / 2);
      const coil1 = new THREE.Mesh(coilMainGeo, bareCopperMat);
      coil1.position.set(-0.08, 0.12, 0.04);
      coil1.castShadow = !isSoftwareGl;
      g.add(coil1);

      const coil2 = new THREE.Mesh(coilMainGeo, bareCopperMat);
      coil2.position.set(0.05, 0.32, -0.02);
      coil2.scale.setScalar(0.86);
      coil2.castShadow = !isSoftwareGl;
      g.add(coil2);

      const strandGeo = track(new THREE.TorusGeometry(0.34, 0.055, 16, 40));
      strandGeo.rotateX(Math.PI / 2);
      const strand = new THREE.Mesh(strandGeo, terracottaSleeveMat);
      strand.position.set(0.18, 0.47, 0.06);
      strand.rotation.z = 0.14;
      strand.castShadow = !isSoftwareGl;
      g.add(strand);

      // Stripped thick armored cable bundle
      const cableGeo = track(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 20));
      cableGeo.rotateZ(Math.PI / 2);
      const sleeve = new THREE.Mesh(cableGeo, darkInsulationMat);
      sleeve.position.set(0, 0.07, 0.56);
      sleeve.rotation.y = -0.15;
      sleeve.castShadow = !isSoftwareGl;
      g.add(sleeve);

      const coreGeo = track(new THREE.CylinderGeometry(0.036, 0.036, 1.32, 16));
      coreGeo.rotateZ(Math.PI / 2);
      const copperCore = new THREE.Mesh(coreGeo, bareCopperMat);
      copperCore.position.copy(sleeve.position);
      copperCore.rotation.copy(sleeve.rotation);
      g.add(copperCore);

      // Solid copper busbar ingot
      const busbarGeo = track(new THREE.BoxGeometry(0.55, 0.1, 0.22));
      const busbar = new THREE.Mesh(busbarGeo, bareCopperMat);
      busbar.position.set(-0.48, 0.05, -0.38);
      busbar.rotation.y = 0.35;
      busbar.castShadow = !isSoftwareGl;
      g.add(busbar);
    }

    // 2. PRINTED CIRCUIT BOARDS (8 parts)
    {
      const g = materialGroups.pcb;
      const pcbTex = track(createPcbTexture(maxAniso));
      const pcbBoardMat = track(
        new THREE.MeshStandardMaterial({
          map: pcbTex,
          roughness: 0.42,
          metalness: 0.18,
        })
      );
      const goldMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xf4c44e,
          metalness: 0.96,
          roughness: 0.16,
          envMapIntensity: 1.3,
        })
      );
      const siliconMat = track(
        new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.65, metalness: 0.12 })
      );
      const capacitorMat = track(
        new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.45 })
      );
      const heatsinkMat = track(
        new THREE.MeshStandardMaterial({ color: 0xc2652b, metalness: 0.9, roughness: 0.24 })
      );

      const boardGeo = track(createRoundedPlateGeometry(1.38, 0.98, 0.05, 0.06));
      const board1 = new THREE.Mesh(boardGeo, pcbBoardMat);
      board1.position.set(0, 0, 0.05);
      board1.castShadow = !isSoftwareGl;
      board1.receiveShadow = !isSoftwareGl;
      g.add(board1);

      const board2 = new THREE.Mesh(boardGeo, pcbBoardMat);
      board2.position.set(-0.08, 0.11, -0.05);
      board2.rotation.y = 0.18;
      board2.scale.set(0.84, 1, 0.84);
      board2.castShadow = !isSoftwareGl;
      g.add(board2);

      // Main BGA processor
      const icGeo = track(new THREE.BoxGeometry(0.32, 0.05, 0.32));
      const ic = new THREE.Mesh(icGeo, siliconMat);
      ic.position.set(-0.08, 0.18, -0.04);
      ic.rotation.y = 0.18;
      ic.castShadow = !isSoftwareGl;
      g.add(ic);

      // Gold edge fingers
      const fingerGeo = track(new THREE.BoxGeometry(0.68, 0.06, 0.08));
      const fingers = new THREE.Mesh(fingerGeo, goldMat);
      fingers.position.set(0.18, 0.03, 0.52);
      g.add(fingers);

      // Copper heatsink fins
      const finGeo = track(new THREE.BoxGeometry(0.28, 0.16, 0.03));
      for (let i = -1; i <= 1; i++) {
        const fin = new THREE.Mesh(finGeo, heatsinkMat);
        fin.position.set(0.26, 0.23, -0.14 + i * 0.08);
        fin.castShadow = !isSoftwareGl;
        g.add(fin);
      }

      // Electrolytic capacitors
      const capGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 16));
      const capPositions: [number, number][] = [
        [-0.45, -0.22],
        [-0.45, -0.05],
        [-0.3, -0.22],
      ];
      for (const [cx, cz] of capPositions) {
        const cap = new THREE.Mesh(capGeo, capacitorMat);
        cap.position.set(cx, 0.24, cz);
        cap.castShadow = !isSoftwareGl;
        g.add(cap);
      }
    }

    // 3. ALUMINIUM SCRAP EXTRUSIONS & SPUN ALLOY RIM (6 parts)
    {
      const g = materialGroups.aluminium;
      const brushedAluMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xdce4ec,
          metalness: 0.94,
          roughness: 0.18,
          envMapIntensity: 1.25,
        })
      );
      const castAluMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          metalness: 0.82,
          roughness: 0.44,
        })
      );

      // Extruded I-beam profile
      const iShape = new THREE.Shape();
      iShape.moveTo(-0.14, -0.14);
      iShape.lineTo(0.14, -0.14);
      iShape.lineTo(0.14, -0.08);
      iShape.lineTo(0.04, -0.08);
      iShape.lineTo(0.04, 0.08);
      iShape.lineTo(0.14, 0.08);
      iShape.lineTo(0.14, 0.14);
      iShape.lineTo(-0.14, 0.14);
      iShape.lineTo(-0.14, 0.08);
      iShape.lineTo(-0.04, 0.08);
      iShape.lineTo(-0.04, -0.08);
      iShape.lineTo(-0.14, -0.08);
      iShape.closePath();

      const beamGeo = track(
        new THREE.ExtrudeGeometry(iShape, {
          depth: 1.15,
          bevelEnabled: true,
          bevelThickness: 0.015,
          bevelSize: 0.015,
          bevelSegments: 2,
        })
      );
      beamGeo.center();

      const beam1 = new THREE.Mesh(beamGeo, brushedAluMat);
      beam1.position.set(-0.22, 0.15, 0.12);
      beam1.rotation.y = 0.52;
      beam1.castShadow = !isSoftwareGl;
      g.add(beam1);

      const beam2 = new THREE.Mesh(beamGeo, brushedAluMat);
      beam2.position.set(0.12, 0.15, -0.22);
      beam2.rotation.y = -0.32;
      beam2.castShadow = !isSoftwareGl;
      g.add(beam2);

      // Spun LatheGeometry alloy housing ring
      const lathePts = [
        new THREE.Vector2(0.14, 0),
        new THREE.Vector2(0.36, 0),
        new THREE.Vector2(0.4, 0.12),
        new THREE.Vector2(0.34, 0.28),
        new THREE.Vector2(0.28, 0.28),
        new THREE.Vector2(0.28, 0.08),
        new THREE.Vector2(0.14, 0.08),
      ];
      const latheGeo = track(new THREE.LatheGeometry(lathePts, 32));
      const alloyHousing = new THREE.Mesh(latheGeo, castAluMat);
      alloyHousing.position.set(0.18, 0.29, 0.14);
      alloyHousing.castShadow = !isSoftwareGl;
      g.add(alloyHousing);

      // Machined billet block
      const billetGeo = track(new THREE.BoxGeometry(0.44, 0.18, 0.26));
      const billet = new THREE.Mesh(billetGeo, brushedAluMat);
      billet.position.set(-0.36, 0.37, -0.05);
      billet.rotation.y = -0.2;
      billet.castShadow = !isSoftwareGl;
      g.add(billet);
    }

    // 4. INDUSTRIAL BATTERIES (7 parts)
    {
      const g = materialGroups.battery;
      const casingMat = track(
        new THREE.MeshStandardMaterial({ color: 0x1b2124, roughness: 0.68, metalness: 0.08 })
      );
      const lidMat = track(
        new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.48, metalness: 0.12 })
      );
      const brassPostMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xeab308,
          metalness: 0.94,
          roughness: 0.2,
          envMapIntensity: 1.25,
        })
      );
      const hazardTex = track(createHazardStripeTexture(maxAniso));
      const hazardBandMat = track(
        new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5, metalness: 0.1 })
      );

      const bodyGeo = track(new THREE.BoxGeometry(0.95, 0.56, 0.62));
      const body = new THREE.Mesh(bodyGeo, casingMat);
      body.position.set(0, 0.28, 0);
      body.castShadow = !isSoftwareGl;
      g.add(body);

      const lidGeo = track(new THREE.BoxGeometry(0.99, 0.09, 0.66));
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(0, 0.59, 0);
      lid.castShadow = !isSoftwareGl;
      g.add(lid);

      // Hazard warning wrap band
      const bandGeo = track(new THREE.BoxGeometry(0.96, 0.11, 0.63));
      const band = new THREE.Mesh(bandGeo, hazardBandMat);
      band.position.set(0, 0.22, 0);
      g.add(band);

      // Brass terminal posts
      const postGeo = track(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 18));
      const posTerm = new THREE.Mesh(postGeo, brassPostMat);
      posTerm.position.set(-0.3, 0.68, -0.16);
      g.add(posTerm);

      const negTerm = new THREE.Mesh(postGeo, brushedSteelMat);
      negTerm.position.set(0.3, 0.68, -0.16);
      g.add(negTerm);

      // Secondary Li-Ion cell pack beside main battery
      const packGeo = track(new THREE.BoxGeometry(0.42, 0.22, 0.36));
      const pack = new THREE.Mesh(packGeo, lidMat);
      pack.position.set(0.56, 0.11, 0.24);
      pack.rotation.y = -0.25;
      pack.castShadow = !isSoftwareGl;
      g.add(pack);
    }

    const cargoAnchor = new THREE.Group();
    cargoAnchor.position.set(0, 0.07, 0);
    deckGroup.add(cargoAnchor);

    Object.entries(materialGroups).forEach(([key, grp]) => {
      grp.visible = key === stateRef.current.selectedMaterial;
      cargoAnchor.add(grp);
    });

    // Subtle InstancedMesh floating metallic recovery particles
    const particleCount = 28;
    const pGeo = track(new THREE.OctahedronGeometry(0.032, 0));
    const pMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.9,
        roughness: 0.2,
      })
    );
    const particles = new THREE.InstancedMesh(pGeo, pMat, particleCount);
    particles.frustumCulled = false;
    const particleSeeds = Array.from({ length: particleCount }, (_, i) => ({
      angle: (i / particleCount) * Math.PI * 2,
      radius: 1.65 + (i % 5) * 0.24,
      yBase: 0.35 + (i % 4) * 0.38,
      speed: 0.22 + (i % 3) * 0.08,
      scale: 0.7 + (i % 4) * 0.2,
    }));
    const _mat4 = new THREE.Matrix4();
    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _euler = new THREE.Euler();
    const _scale = new THREE.Vector3();

    for (let i = 0; i < particleCount; i++) {
      const s = particleSeeds[i];
      _pos.set(Math.cos(s.angle) * s.radius, s.yBase, Math.sin(s.angle) * s.radius);
      _scale.setScalar(s.scale);
      _mat4.compose(_pos, _quat, _scale);
      particles.setMatrixAt(i, _mat4);
    }
    particles.instanceMatrix.needsUpdate = true;
    particles.computeBoundingSphere();
    scene.add(particles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Dynamic state tracking for smooth spring animations
    let lastMaterialKey: Material3DKey = stateRef.current.selectedMaterial;
    let lastWeight = stateRef.current.weightKg;
    let lastRate = stateRef.current.ratePerKg;
    let lastLabel = stateRef.current.displayLabel;
    let dropOffset = 0;
    let deckDepression = 0;
    const clock = new THREE.Clock();
    let frameId = 0;
    let firstFrameDrawn = false;

    const resizeHandler = () => {
      if (!host || disposed) return;
      const w = Math.max(host.clientWidth, 260);
      const h = Math.max(host.clientHeight, 220);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(resizeHandler);
    resizeObserver.observe(host);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    const onContextRestored = () => {
      if (!disposed) tick();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      const cur = stateRef.current;
      const materialChanged = cur.selectedMaterial !== lastMaterialKey;
      if (materialChanged) {
        materialGroups[lastMaterialKey].visible = false;
        materialGroups[cur.selectedMaterial].visible = true;
        lastMaterialKey = cur.selectedMaterial;
        dropOffset = 0.42;
        deckDepression = -0.045;
      }

      if (
        cur.weightKg !== lastWeight ||
        cur.ratePerKg !== lastRate ||
        cur.displayLabel !== lastLabel ||
        materialChanged
      ) {
        lastWeight = cur.weightKg;
        lastRate = cur.ratePerKg;
        lastLabel = cur.displayLabel;
        const meta = MATERIAL_3D_LIST.find((m) => m.key === cur.selectedMaterial);
        drawDisplayScreen(
          displayCanvas,
          cur.displayLabel || meta?.shortLabel || 'E-Waste',
          cur.weightKg,
          cur.ratePerKg
        );
        displayTex.needsUpdate = true;
        deckDepression = -0.032;
      }

      if (cur.resetRequested) {
        cur.resetRequested = false;
        camera.position.copy(defaultCamPos);
        controls.target.copy(defaultTarget);
        userInteracting = false;
        controls.autoRotate = !prefersReduced && !isSoftwareGl;
      }

      // Smooth exponential damping on cargo drop & scale load spring
      dropOffset = THREE.MathUtils.damp(dropOffset, 0, 9, delta);
      const targetLoadY = 0.24 - Math.min(0.03, (cur.weightKg / 100) * 0.03) + deckDepression;
      deckDepression = THREE.MathUtils.damp(deckDepression, 0, 7, delta);
      deckGroup.position.y = THREE.MathUtils.damp(deckGroup.position.y, targetLoadY, 10, delta);

      const activeCargo = materialGroups[cur.selectedMaterial];
      activeCargo.position.y = dropOffset;
      if (!prefersReduced) {
        activeCargo.rotation.y = Math.sin(elapsed * 0.45) * 0.14;
      }

      if (!prefersReduced) {
        for (let i = 0; i < particleCount; i++) {
          const s = particleSeeds[i];
          const a = s.angle + elapsed * s.speed * 0.35;
          _pos.set(
            Math.cos(a) * s.radius,
            s.yBase + Math.sin(elapsed * 1.1 + i) * 0.08,
            Math.sin(a) * s.radius
          );
          _euler.set(elapsed * 0.7 + i, elapsed * 0.9, 0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(s.scale);
          _mat4.compose(_pos, _quat, _scale);
          particles.setMatrixAt(i, _mat4);
        }
        particles.instanceMatrix.needsUpdate = true;
      }

      if (!userInteracting && !prefersReduced && isSoftwareGl) {
        camera.position.applyAxisAngle(THREE.Object3D.DEFAULT_UP, delta * 0.18);
      }

      controls.update();
      renderer.render(scene, camera);

      if (!firstFrameDrawn) {
        firstFrameDrawn = true;
        setSceneReady(true);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    const initMeta = MATERIAL_3D_LIST.find((m) => m.key === stateRef.current.selectedMaterial);
    drawDisplayScreen(
      displayCanvas,
      stateRef.current.displayLabel || initMeta?.shortLabel || 'Copper',
      stateRef.current.weightKg,
      stateRef.current.ratePerKg
    );
    displayTex.needsUpdate = true;

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
    }

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      cleanupScene?.();
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div className="w-full h-full min-h-[300px] relative rounded-2xl overflow-hidden bg-slate-900">
        <img
          src={heroPoster}
          alt="Authorised e-waste sorting facility and digital weighbridge scale"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[300px] sm:min-h-[360px] relative rounded-2xl overflow-hidden bg-[#0c1713] select-none">
      {!sceneReady && (
        <img
          src={heroPoster}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}
      {/* Dedicated WebGL Mount Container (isolated from React HUD siblings) */}
      <div
        ref={mountRef}
        className={`w-full h-full min-h-[300px] sm:min-h-[360px] transition-opacity duration-300 ${
          sceneReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Top-Left Minimal Spec Readout (no backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-[#091410]/90 border border-emerald-900/60 px-3 py-1.5 text-xs text-slate-200">
        <Orbit className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-mono tabular-nums">Drag to rotate 3D · Scroll to zoom</span>
      </div>

      {/* Top-Right Camera Reset (solid rgba background, no backdrop-blur) */}
      <button
        type="button"
        onClick={() => {
          stateRef.current.resetRequested = true;
        }}
        aria-label="Reset 3D camera angle"
        className="absolute top-3 right-3 z-10 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg bg-[#091410]/90 hover:bg-[#13241d] text-slate-200 border border-emerald-900/60 transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      {/* Compact Bottom Material Switcher Dock (no backdrop-blur over WebGL) */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-2 rounded-xl bg-[#091410]/92 border border-emerald-900/60 p-1.5 overflow-x-auto">
        <div className="flex items-center gap-1" role="group" aria-label="3D material selector">
          {MATERIAL_3D_LIST.map((item) => {
            const active = selectedMaterial === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectMaterial(item.key)}
                className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#b04a17] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
        <div className="hidden sm:block pr-2 font-mono text-xs tabular-nums text-amber-300 whitespace-nowrap shrink-0">
          {weightKg.toFixed(0)} kg · ₹{Math.round(weightKg * ratePerKg).toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  );
};
