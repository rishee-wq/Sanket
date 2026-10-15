/**
 * Renders kinematic hands (see handModel.ts) as lit, skin-shaded 3D models with three.js.
 * Used by the Learn mode tutor (animated, orbitable) and for still images on the landing page.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FINGERS, HandShape, SEGMENT_RADII, SHAPES, Vec3, handJoints } from './handModel';

export interface HandPose {
  shape: HandShape;
  /** Wrist position in signing space, cm. Chest centre is the origin; +Y up, +Z towards the viewer. */
  position: Vec3;
  /** Wrist rotation in degrees (X pitch, Y yaw, Z roll). [0,0,0] = palm to the viewer, fingers up. */
  rotation: Vec3;
}

export const SKIN_TONES = [
  { name: 'Deep', color: '#8a5a3c' },
  { name: 'Brown', color: '#b07650' },
  { name: 'Medium', color: '#c99070' },
  { name: 'Light', color: '#e4b898' },
] as const;

/** Bones as joint index pairs, with the radius index into SEGMENT_RADII. */
const SEGMENTS: { a: number; b: number; finger: keyof typeof SEGMENT_RADII; k: number }[] = [
  { a: 1, b: 2, finger: 'thumb', k: 0 },
  { a: 2, b: 3, finger: 'thumb', k: 1 },
  { a: 3, b: 4, finger: 'thumb', k: 2 },
  ...FINGERS.flatMap((finger, f) =>
    [0, 1, 2].map((k) => ({ a: 5 + f * 4 + k, b: 6 + f * 4 + k, finger, k }))
  ),
];
const TIPS = [4, 8, 12, 16, 20];

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 1, 0);

function palmGeometry(): THREE.BufferGeometry {
  // Outline of the palm in the XY plane, a little inside the knuckles; the bevel rounds it out.
  const shape = new THREE.Shape();
  shape.moveTo(1.7, 0.2);
  shape.splineThru([
    new THREE.Vector2(2.75, 2.6),
    new THREE.Vector2(2.6, 6.0),
    new THREE.Vector2(2.0, 7.7),
    new THREE.Vector2(0.6, 8.1),
    new THREE.Vector2(-1.15, 7.75),
    new THREE.Vector2(-2.4, 7.0),
    new THREE.Vector2(-2.8, 4.8),
    new THREE.Vector2(-2.65, 2.0),
    new THREE.Vector2(-1.9, 0.2),
  ]);
  shape.quadraticCurveTo(0, -0.5, 1.7, 0.2);
  const depth = 1.3;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.75,
    bevelSize: 0.7,
    bevelSegments: 8,
    curveSegments: 32,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** One hand: palm, thenar pad, 15 phalanges, knuckles, nails, wrist and sleeve. */
class HandMesh extends THREE.Group {
  private bones: THREE.Mesh[] = [];
  private joints: THREE.Mesh[] = [];
  private nails: THREE.Mesh[] = [];
  /** Everything but the forearm and sleeve, for framing. */
  readonly parts: THREE.Object3D[] = [];
  readonly wrist = new THREE.Group();

  constructor(skin: THREE.Material, nail: THREE.Material, sleeve: THREE.Material, left: boolean) {
    super();
    this.add(this.wrist);
    if (left) this.wrist.scale.x = -1;

    const palm = new THREE.Mesh(palmGeometry(), skin);
    const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skin);
    thenar.position.set(1.75, 2.7, 0.55);
    thenar.scale.set(1.5, 2.3, 1.15);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.6, 7, 40, 1, true), skin);
    forearm.position.set(0.1, -2.6, 0);
    forearm.scale.set(1.2, 1, 0.78);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.5, 12, 48), sleeve);
    cuff.position.set(0.1, -11.5, 0);
    cuff.scale.set(1.2, 1, 0.82);
    this.wrist.add(palm, thenar, forearm, cuff);

    // Phalanx lengths never change (only angles do), so each capsule is built once.
    const rest = handJoints(SHAPES.rest).map(v);
    for (const seg of SEGMENTS) {
      const r = SEGMENT_RADII[seg.finger][seg.k];
      const len = rest[seg.a].distanceTo(rest[seg.b]);
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 20), skin);
      this.bones.push(bone);
      this.wrist.add(bone);
    }
    // Knuckle pads where fingers meet the palm, so the join reads as one surface.
    for (let f = 0; f < 4; f++) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin);
      knuckle.scale.setScalar(SEGMENT_RADII[FINGERS[f]][0] * 1.08);
      this.joints.push(knuckle);
      this.wrist.add(knuckle);
    }
    for (let i = 0; i < 5; i++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), nail);
      this.nails.push(n);
      this.wrist.add(n);
    }
    this.parts.push(palm, thenar, ...this.bones, ...this.joints);
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  setPose(pose: HandPose) {
    this.position.set(...pose.position);
    this.rotation.set(
      THREE.MathUtils.degToRad(pose.rotation[0]),
      THREE.MathUtils.degToRad(pose.rotation[1]),
      THREE.MathUtils.degToRad(pose.rotation[2]),
      'YXZ'
    );

    const j = handJoints(pose.shape).map(v);
    SEGMENTS.forEach((seg, i) => {
      const a = j[seg.a];
      const b = j[seg.b];
      const bone = this.bones[i];
      const dir = b.clone().sub(a);
      bone.position.copy(a).addScaledVector(dir, 0.5);
      bone.quaternion.setFromUnitVectors(UP, dir.normalize());
    });

    for (let f = 0; f < 4; f++) this.joints[f].position.copy(j[5 + f * 4]).add(new THREE.Vector3(0, -0.15, -0.1));

    TIPS.forEach((tip, i) => {
      const a = j[tip - 1];
      const b = j[tip];
      const d = b.clone().sub(a).normalize();
      // Nails sit on the back of the fingertip (the -Z side when the finger is straight).
      const side = new THREE.Vector3(1, 0, 0);
      let back = d.clone().cross(side).normalize();
      if (i === 0) back = new THREE.Vector3(0.45, -0.2, -1).projectOnPlane(d).normalize();
      const r = SEGMENT_RADII[i === 0 ? 'thumb' : FINGERS[i - 1]][2];
      const n = this.nails[i];
      n.position.copy(a).addScaledVector(b.clone().sub(a), 0.62).addScaledVector(back, r * 0.86);
      n.scale.set(r * 0.62, b.distanceTo(a) * 0.36, r * 0.16);
      n.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.clone().cross(back).normalize(), d, back));
    });
  }
}

/** Head and shoulders silhouette that shows where a sign is made. Chest centre is the origin. */
function bodyGroup(material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(8.6, 48, 36), material);
  head.position.set(0, 31, -16);
  head.scale.set(0.92, 1.1, 1);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 9, 32), material);
  neck.position.set(0, 20, -16);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(13, 18, 16, 48), material);
  torso.rotation.z = Math.PI / 2;
  torso.position.set(0, 7, -16);
  torso.scale.set(1, 1, 0.55);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(19, 15, 34, 48), material);
  chest.position.set(0, -10, -16);
  chest.scale.set(1, 1, 0.52);
  g.add(head, neck, torso, chest);
  g.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
  return g;
}

interface StageOptions {
  /** Show the head-and-shoulders silhouette. */
  body?: boolean;
  /** Allow drag-to-orbit. */
  interactive?: boolean;
  /** Keep the drawing buffer so the canvas can be copied (for still images). */
  preserve?: boolean;
  skin?: string;
}

export class HandStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 1, 1000);
  private controls: OrbitControls | null = null;
  private skin: THREE.MeshPhysicalMaterial;
  private right: HandMesh;
  private left: HandMesh;
  private body: THREE.Group;
  private pmrem: THREE.PMREMGenerator;

  constructor(canvas: HTMLCanvasElement, options: StageOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: options.preserve ?? false,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.skin = new THREE.MeshPhysicalMaterial({
      color: options.skin ?? SKIN_TONES[1].color,
      roughness: 0.5,
      metalness: 0,
      sheen: 0.7,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color('#ffb48a'),
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
    });
    const nail = new THREE.MeshPhysicalMaterial({ color: '#f3d2c4', roughness: 0.25, clearcoat: 0.8 });
    const sleeve = new THREE.MeshStandardMaterial({ color: '#16130f', roughness: 0.9 });
    const silhouette = new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 0.95 });

    this.right = new HandMesh(this.skin, nail, sleeve, false);
    this.left = new HandMesh(this.skin, nail, sleeve, true);
    this.body = bodyGroup(silhouette);
    this.body.visible = options.body ?? false;
    this.left.visible = false;
    this.scene.add(this.right, this.left, this.body);

    const hemi = new THREE.HemisphereLight('#fff3e6', '#140c08', 0.7);
    const key = new THREE.DirectionalLight('#fff0dc', 2.6);
    key.position.set(30, 50, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -45;
    key.shadow.camera.right = key.shadow.camera.top = 45;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0008;
    const rim = new THREE.DirectionalLight('#ff9a3c', 3.2);
    rim.position.set(-40, 30, -60);
    const fill = new THREE.DirectionalLight('#b4c0ff', 0.9);
    fill.position.set(-60, -10, 40);
    this.scene.add(hemi, key, rim, fill);

    if (options.interactive) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enablePan = false;
      this.controls.enableZoom = false;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minPolarAngle = Math.PI * 0.18;
      this.controls.maxPolarAngle = Math.PI * 0.78;
    }
  }

  setSkin(color: string) {
    this.skin.color.set(color);
  }

  setBodyVisible(visible: boolean) {
    this.body.visible = visible;
  }

  setPoses(right: HandPose | null, left: HandPose | null) {
    this.right.visible = right !== null;
    this.left.visible = left !== null;
    if (right) this.right.setPose(right);
    if (left) this.left.setPose(left);
  }

  /** Points the camera at `target` from `distance`, looking slightly down from the front. */
  frame(target: Vec3, distance: number, azimuth = 0, elevation = 8) {
    const t = v(target);
    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(elevation);
    this.camera.position.set(
      t.x + distance * Math.sin(az) * Math.cos(el),
      t.y + distance * Math.sin(el),
      t.z + distance * Math.cos(az) * Math.cos(el)
    );
    this.camera.lookAt(t);
    if (this.controls) {
      this.controls.target.copy(t);
      this.controls.update();
    }
  }

  /** Frames whatever hands are visible, filling about `fill` of the view. */
  frameHands(fill = 0.82, azimuth = 0, elevation = 6) {
    const box = new THREE.Box3();
    this.scene.updateMatrixWorld(true);
    for (const h of [this.right, this.left]) if (h.visible) h.parts.forEach((p) => box.expandByObject(p));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = size.y / 2 / Math.tan(vFov / 2);
    const fitW = size.x / 2 / Math.tan(vFov / 2) / this.camera.aspect;
    this.frame([center.x, center.y, center.z], Math.max(fitH, fitW) / fill + size.z / 2, azimuth, elevation);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  resetView() {
    this.controls?.reset();
  }

  render() {
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.controls?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const m = mesh.material;
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
