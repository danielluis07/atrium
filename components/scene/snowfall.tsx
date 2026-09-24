"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type PerspectiveCamera,
  type Points,
} from "three";

import { SNOW_SHADOW } from "@/components/scene/palette";

/**
 * Light snowfall: one `Points` animated wholly on the GPU
 * (`docs/research/scene-rendering.md` §8). Each flake falls and sways from a
 * fixed seed, wrapped in a box that rides ahead of the camera, so the CPU only
 * moves the box and the clock. Flakes are fogged like everything else, so the
 * far ones melt into the air.
 */

/** The box the flakes fill, metres: across, up, along the view. */
const BOX = new Vector3(80, 45, 80);
/** How far ahead of the camera the box's centre rides. */
const AHEAD = 32;
/** Flake diameter, metres. */
const FLAKE = 0.035;
/** The largest a flake is drawn, CSS pixels, however close it falls. */
const MAX_PIXELS = 10;
/** Flakes pale in the dusk, well under the bloom threshold. */
const FLAKE_COLOR = SNOW_SHADOW.clone().multiplyScalar(1.6);

const vertex = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uPixelsPerMetre;
uniform float uPixelRatio;
attribute vec4 seed;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  // a flake falls at 0.8–1.4 m/s, sways on its own phase and drifts on a light wind
  float fall = 0.8 + 0.6 * seed.w;
  float phase = seed.w * 6.2832;
  vec3 p = seed.xyz * uBox + vec3(
    0.35 * uTime + 0.5 * sin( 0.9 * uTime + phase ),
    -fall * uTime,
    0.4 * sin( 0.7 * uTime + phase * 1.7 )
  );
  // wrapped into the box around the camera, so the flakes stay put in the world as the camera moves
  vec3 low = uCenter - 0.5 * uBox;
  vec3 world = low + mod( p - low, uBox );
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  float pixels = ${FLAKE.toFixed(4)} * ( 0.6 + 0.8 * fract( seed.w * 13.0 ) ) * uPixelsPerMetre / -mvPosition.z;
  gl_PointSize = clamp( pixels, 1.5, ${MAX_PIXELS.toFixed(1)} ) * uPixelRatio;
  // a flake under a pixel and a half is drawn fainter rather than smaller; flakes fade in and out at the box's edges
  vec3 edge = abs( world - uCenter ) / ( 0.5 * uBox );
  float fade = 1.0 - smoothstep( 0.8, 1.0, max( max( edge.x, edge.y ), edge.z ) );
  vAlpha = fade * min( 1.0, pixels / 1.5 ) * smoothstep( 0.5, 2.0, -mvPosition.z );
  #include <fog_vertex>
}`;

const fragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float r = length( gl_PointCoord - 0.5 );
  float a = vAlpha * ( 1.0 - smoothstep( 0.2, 0.5, r ) );
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( uColor, a );
  #include <fog_fragment>
}`;

function snowGeometry(count: number): BufferGeometry {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const geometry = new BufferGeometry();
  // the positions are only there for three's draw count; the flakes are placed from their seeds
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("seed", new Float32BufferAttribute(seeds, 4));
  return geometry;
}

const forward = new Vector3();

/** `count` flakes in the air around the camera. */
export function Snowfall({ count }: { count: number }) {
  const ref = useRef<Points<BufferGeometry, ShaderMaterial>>(null);
  const geometry = useMemo(() => snowGeometry(count), [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        fog: true,
        transparent: true,
        depthWrite: false,
        uniforms: UniformsUtils.merge([
          UniformsLib.fog,
          {
            uTime: { value: 0 },
            uCenter: { value: new Vector3() },
            uBox: { value: BOX },
            uPixelsPerMetre: { value: 1 },
            uPixelRatio: { value: 1 },
            uColor: { value: FLAKE_COLOR },
          },
        ]),
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, size, viewport }, dt) => {
    if (!ref.current) return;
    const u = ref.current.material.uniforms;
    u.uTime.value += dt;
    camera.getWorldDirection(forward);
    u.uCenter.value.copy(camera.position).addScaledVector(forward, AHEAD);
    // a metre at a metre's distance, in CSS pixels, so flakes are the same size on every rung
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    u.uPixelsPerMetre.value = (0.5 * size.height) / Math.tan(fov / 2);
    u.uPixelRatio.value = viewport.dpr;
  });

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />;
}
