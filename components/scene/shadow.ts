import {
  Box3,
  Color,
  DataTexture,
  DepthTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshDepthMaterial,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type BufferGeometry,
  type Texture,
  type WebGLRenderer,
} from "three";

import { keyDirection } from "@/components/scene/palette";
import { WATER_LEVEL } from "@/lib/scene/terrain";

/**
 * The Scene's one shadow map, baked once when the Houses and pines are in
 * (`docs/research/scene-rendering.md` §7). Nothing that casts a shadow ever
 * moves, so rather than a real-time light, the Houses and pines are drawn
 * once into a depth map from the bright sky over the afterglow, and that is
 * resolved once, with a wide soft filter, into a mask laid over the terrain
 * in plan. The snow then reads one texel of it a frame: where the mask is
 * dark, that part of the sky is hidden and the snow is a little bluer and
 * darker. The Houses themselves carry their baked light and take none of it.
 */

/** The layer the shadow casters are also on, so the bake draws only them. */
export const CASTER_LAYER = 1;

/** The plan area the mask covers, three.js x and z: the pines' ground and the Houses on it. */
const RECT = { x: [-260, 260], z: [-250, 70] } as const;
/** Up to where a caster may reach, metres: over the tallest pine on the ridge. */
const TOP = 60;
const MASK_SIZE: [number, number] = [1024, 640];
const DEPTH_MAP_SIZE = 2048;
/** The softness of a shadow's edge, metres: blue hour has no hard sun. */
const PENUMBRA = 0.9;
/** How far a surface sits behind the depth it is tested against before it is in shadow, metres. */
const BIAS = 0.3;
/** How much of the snow's light a full shadow takes. */
const SHADOW_STRENGTH = 0.5;
const TAPS = 16;

export type ShadowUniforms = {
  shadowMask: { value: Texture };
  /** The mask's plan rectangle: min x, min z, 1 / width, 1 / depth. */
  shadowRect: { value: Vector4 };
};

const unshadowed = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
unshadowed.needsUpdate = true;

/** The mask's uniforms, unshadowed until `bakeShadow` fills them in. */
export function shadowUniforms(): ShadowUniforms {
  return {
    shadowMask: { value: unshadowed },
    shadowRect: {
      value: new Vector4(RECT.x[0], RECT.z[0], 1 / (RECT.x[1] - RECT.x[0]), 1 / (RECT.z[1] - RECT.z[0])),
    },
  };
}

/** Declarations for a fragment shader that reads the mask at a world plan point. */
export const shadowMaskPars = /* glsl */ `
uniform sampler2D shadowMask;
uniform vec4 shadowRect;
float shadowLight( vec2 xz ) {
  vec2 uv = ( xz - shadowRect.xy ) * shadowRect.zw;
  float lit = texture2D( shadowMask, uv ).r;
  // outside the mask nothing casts
  lit = any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ? 1.0 : lit;
  return 1.0 - ${SHADOW_STRENGTH.toFixed(3)} * ( 1.0 - lit );
}`;

const bakeVertex = /* glsl */ `
uniform vec4 uRect;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  // drawn straight into the mask's plan rectangle, whatever the camera
  gl_Position = vec4( ( world.xz - uRect.xy ) * uRect.zw * 2.0 - 1.0, 0.0, 1.0 );
}`;

const bakeFragment = /* glsl */ `
uniform sampler2D uDepth;
uniform mat4 uLight;
uniform vec2 uTaps[ ${TAPS} ];
uniform float uBias;
varying vec3 vWorld;
void main() {
  vec4 p = uLight * vec4( vWorld, 1.0 );
  vec3 c = p.xyz / p.w * 0.5 + 0.5;
  float lit = 0.0;
  for ( int i = 0; i < ${TAPS}; i++ ) {
    lit += c.z - uBias <= texture2D( uDepth, c.xy + uTaps[ i ] ).r ? 1.0 : 0.0;
  }
  gl_FragColor = vec4( vec3( lit / ${TAPS}.0 ), 1.0 );
}`;

/**
 * Bakes the mask from everything on `CASTER_LAYER` in `scene`, over the
 * terrain `ground`, into the uniforms. Returns what disposes the mask.
 */
export function bakeShadow(
  gl: WebGLRenderer,
  scene: Scene,
  ground: BufferGeometry,
  north: number,
  uniforms: ShadowUniforms,
): () => void {
  const light = lightCamera(north);
  const depth = new WebGLRenderTarget(DEPTH_MAP_SIZE, DEPTH_MAP_SIZE, {
    depthTexture: new DepthTexture(DEPTH_MAP_SIZE, DEPTH_MAP_SIZE),
  });
  const mask = new WebGLRenderTarget(...MASK_SIZE, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });

  // a Vogel spiral of taps across the penumbra, in the depth map's UV, which is stretched to the light's frustum
  const across = PENUMBRA / (light.right - light.left);
  const up = PENUMBRA / (light.top - light.bottom);
  const taps = Array.from({ length: TAPS }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / TAPS);
    const a = i * 2.39996;
    return new Vector2(r * Math.cos(a) * across, r * Math.sin(a) * up);
  });
  const material = new ShaderMaterial({
    vertexShader: bakeVertex,
    fragmentShader: bakeFragment,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRect: { value: uniforms.shadowRect.value },
      uDepth: { value: depth.depthTexture },
      uLight: { value: light.projectionMatrix.clone().multiply(light.matrixWorldInverse) },
      uTaps: { value: taps },
      uBias: { value: BIAS / (light.far - light.near) },
    },
  });
  const plan = new Scene().add(new Mesh(ground, material));
  plan.children[0].frustumCulled = false;
  // the light camera sees only the casters; the plan pass places its own vertices, so any camera will do
  const planCamera = new OrthographicCamera();
  // only depth matters from the light, so the casters draw with the cheapest material there is
  const depthOnly = new MeshDepthMaterial();

  const target = gl.getRenderTarget();
  const clear = gl.getClearColor(new Color());
  const alpha = gl.getClearAlpha();
  try {
    gl.setRenderTarget(depth);
    gl.clear();
    const override = (scene as Scene).overrideMaterial;
    (scene as Scene).overrideMaterial = depthOnly;
    try {
      gl.render(scene, light);
    } finally {
      (scene as Scene).overrideMaterial = override;
    }
    gl.setRenderTarget(mask);
    gl.setClearColor(0xffffff, 1);
    gl.clear();
    gl.render(plan, planCamera);
  } finally {
    gl.setRenderTarget(target);
    gl.setClearColor(clear, alpha);
    depth.depthTexture?.dispose();
    depth.dispose();
    material.dispose();
    depthOnly.dispose();
  }

  uniforms.shadowMask.value = mask.texture;
  return () => {
    uniforms.shadowMask.value = unshadowed;
    mask.dispose();
  };
}

/** An orthographic camera looking down the key direction, fitted to the mask's area. */
function lightCamera(north: number): OrthographicCamera {
  const center = new Vector3((RECT.x[0] + RECT.x[1]) / 2, 0, (RECT.z[0] + RECT.z[1]) / 2);
  const camera = new OrthographicCamera();
  camera.position.copy(center).addScaledVector(keyDirection(north), 1000);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  camera.layers.set(CASTER_LAYER);

  const area = new Box3(new Vector3(RECT.x[0], WATER_LEVEL, RECT.z[0]), new Vector3(RECT.x[1], TOP, RECT.z[1]));
  const fit = new Box3();
  const corner = new Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? area.max.x : area.min.x, i & 2 ? area.max.y : area.min.y, i & 4 ? area.max.z : area.min.z);
    fit.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
  }
  camera.left = fit.min.x;
  camera.right = fit.max.x;
  camera.bottom = fit.min.y;
  camera.top = fit.max.y;
  // the camera looks down −z
  camera.near = -fit.max.z - 1;
  camera.far = -fit.min.z + 1;
  camera.updateProjectionMatrix();
  return camera;
}
