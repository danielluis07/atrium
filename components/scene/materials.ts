import {
  Color,
  Matrix4,
  MeshStandardMaterial,
  ShaderChunk,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";

import { OPEN_SNOW, SKY_HORIZON, SKY_ZENITH, SNOW_SHADOW, WINDOW } from "@/components/scene/palette";
import { shadowMaskPars, type ShadowUniforms } from "@/components/scene/shadow";

/**
 * The Houses' materials. Light is baked (ADR 0001): every opaque surface
 * reads its base and window-spill lightmaps as `base + k·spill`, with `k` per
 * House so hover can brighten its windows, and a per-House dim for the
 * Houses left unselected. Warm light comes only from
 * the glazing, which looks into lit rooms (interior mapping), and the
 * soffit downlights, both bright enough to bloom.
 */

/** three's lightmap factor: a baked value times π gives Blender's shading. */
export const LIGHTMAP_INTENSITY = Math.PI;

const LIGHTMAP_READ = "vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );";
if (!ShaderChunk.lights_fragment_maps.includes(LIGHTMAP_READ)) {
  throw new Error("three's lights_fragment_maps changed: the Scene's lightmap patch no longer applies");
}

/** One House's baked light: `spillK` weighs the window spill, and `lightDim` scales it all. */
export type LightUniforms = { spillK: { value: number }; lightDim: { value: number } };

/** A world plan position for the shadow mask, from the vertex shader. */
function withShadow(shader: WebGLProgramParametersWithUniforms, shadow: ShadowUniforms) {
  Object.assign(shader.uniforms, shadow);
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", "varying vec2 vShadowXZ;\nvoid main() {")
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvShadowXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;",
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    "void main() {",
    `varying vec2 vShadowXZ;\n${shadowMaskPars}\nvoid main() {`,
  );
}

/**
 * Adds the spill layer to a lightmapped material. On the plinth the baked
 * light fades to open snow toward its edge, where it meets the live terrain,
 * and takes the same baked shadows as the terrain, so they cross the edge.
 */
export function patchLightmap(
  material: MeshStandardMaterial,
  spill: Texture,
  uniforms: LightUniforms,
  { edgeFade = false, shadow }: { edgeFade?: boolean; shadow?: ShadowUniforms } = {},
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.spillMap = { value: spill };
    shader.uniforms.spillK = uniforms.spillK;
    shader.uniforms.lightDim = uniforms.lightDim;
    shader.uniforms.openSnow = { value: OPEN_SNOW };
    if (shadow) withShadow(shader, shadow);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform sampler2D spillMap;\nuniform float spillK;\nuniform float lightDim;\nuniform vec3 openSnow;\nvoid main() {",
      )
      .replace(
        "#include <lights_fragment_maps>",
        ShaderChunk.lights_fragment_maps.replace(
          LIGHTMAP_READ,
          /* glsl */ `vec4 lightMapTexel = ( texture2D( lightMap, vLightMapUv ) + spillK * texture2D( spillMap, vLightMapUv ) ) * lightDim;
          ${
            edgeFade
              ? /* glsl */ `vec2 lightMapEdge = min( vLightMapUv, 1.0 - vLightMapUv );
          lightMapTexel.rgb = mix( openSnow, lightMapTexel.rgb, smoothstep( 0.0, 0.16, min( lightMapEdge.x, lightMapEdge.y ) ) );`
              : ""
          }
          ${shadow ? "lightMapTexel.rgb *= shadowLight( vShadowXZ );" : ""}`,
        ),
      );
  };
  const key = `lightmap${edgeFade ? "-edge" : ""}${shadow ? "-shadow" : ""}`;
  material.customProgramCacheKey = () => key;
}

/**
 * Lit by the open sky as the plinth's baked edge is, a little darker where a
 * surface turns from the sky: the snow, and the pines and mountains on it.
 * With `shadow`, the open snow takes the baked shadows of the Houses and pines.
 */
export function skyLitMaterial(color: Color, shadow?: ShadowUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color, roughness: 0.8, envMapIntensity: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.openSnow = { value: OPEN_SNOW };
    shader.uniforms.openSnowIntensity = { value: LIGHTMAP_INTENSITY };
    if (shadow) withShadow(shader, shadow);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying float vSkyward;\nvoid main() {")
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nvSkyward = normalize( mat3( modelMatrix ) * objectNormal ).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 openSnow;\nuniform float openSnowIntensity;\nvarying float vSkyward;\nvoid main() {")
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>\nirradiance += openSnow * openSnowIntensity * mix( 0.6, 1.0, vSkyward )${shadow ? " * shadowLight( vShadowXZ )" : ""};`,
      );
  };
  const key = shadow ? "sky-lit-shadow" : "sky-lit";
  material.customProgramCacheKey = () => key;
  return material;
}

const glazingVertex = /* glsl */ `
uniform mat4 uHouse;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  // rooms are laid out in the House's own frame, so they sit on its floors whatever its placement
  vPos = ( uHouse * world ).xyz;
  vNormal = normalize( mat3( uHouse ) * mat3( modelMatrix ) * normal );
  vView = mat3( uHouse ) * ( world.xyz - cameraPosition );
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// Interior mapping: each pane looks into box rooms (3.3 m wide, one Level high, 5 m deep) lit warm.
const glazingFragment = /* glsl */ `
uniform vec3 uWarm;
uniform float uGlow;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSnow;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
#include <fog_pars_fragment>
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec3 sky( vec3 r ) {
  return r.y > 0.0 ? mix( uHorizon, uZenith, pow( r.y, 0.55 ) ) : uSnow * 0.35;
}
void main() {
  vec3 n = normalize( vNormal );
  vec3 V = normalize( vView );
  if ( abs( n.y ) > 0.5 || dot( V, n ) > 0.0 ) { gl_FragColor = vec4( 0.01, 0.011, 0.012, 1.0 ); return; }
  vec3 t = normalize( cross( vec3( 0.0, 1.0, 0.0 ), n ) );
  vec3 room = vec3( 3.3, 3.3, 5.0 );
  vec2 pp = vec2( dot( vPos, t ), vPos.y - 0.12 );
  vec2 cell = floor( pp / room.xy );
  vec3 q = vec3( fract( pp / room.xy ), 0.0 );
  vec3 d = vec3( dot( V, t ), V.y, -dot( V, n ) ) / room;
  vec3 tt = ( step( 0.0, d ) - q ) / d;
  float tm = min( min( tt.x, tt.y ), tt.z );
  vec3 h = q + d * tm;
  float lit = 0.55 + 0.9 * hash( cell + floor( dot( vPos, n ) * 3.0 ) );
  vec3 warm = uWarm;
  vec3 c;
  if ( tm == tt.y && d.y < 0.0 ) {
    // floor: oak, brighter toward the lamp
    float pool = exp( -8.0 * dot( h.xz - vec2( 0.5, 0.55 ), h.xz - vec2( 0.5, 0.55 ) ) );
    c = vec3( 0.42, 0.24, 0.12 ) * ( 0.35 + 1.4 * pool ) * warm;
    c *= 0.85 + 0.15 * step( 0.5, fract( h.x * 9.0 ) );
  } else if ( tm == tt.y ) {
    // ceiling with recessed lights
    vec2 g = fract( h.xz * 2.0 ) - 0.5;
    float spot = 1.0 - smoothstep( 0.03, 0.06, length( g * vec2( 1.0, 2.5 ) ) );
    c = vec3( 0.75 ) * warm * 0.5 + warm * spot * 5.0;
  } else if ( tm == tt.z ) {
    // back wall: plaster, a low dark sofa, a lit artwork
    c = vec3( 0.8, 0.74, 0.66 ) * warm * ( 0.45 + 0.6 * h.y );
    if ( h.y < 0.22 && abs( h.x - 0.45 ) < 0.28 ) c = vec3( 0.12, 0.1, 0.09 ) * warm;
    if ( abs( h.x - 0.45 ) < 0.14 && abs( h.y - 0.55 ) < 0.1 ) c = vec3( 0.25, 0.3, 0.32 ) * warm * 1.4;
  } else {
    // side walls
    c = vec3( 0.78, 0.72, 0.64 ) * warm * ( 0.3 + 0.5 * h.z * h.y );
  }
  c *= lit * uGlow;
  float cosT = clamp( -dot( V, n ), 0.0, 1.0 );
  float F = 0.04 + 0.96 * pow( 1.0 - cosT, 5.0 );
  gl_FragColor = vec4( mix( c, sky( reflect( V, n ) ) * 1.2, F ), 1.0 );
  #include <fog_fragment>
}`;

/** One House's windows. `house` is the inverse of its root's world matrix. */
export function glazingMaterial(house: Matrix4): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader: glazingVertex,
    fragmentShader: glazingFragment,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uHouse: { value: new Matrix4() },
        uWarm: { value: WINDOW.clone().multiplyScalar(2.2) },
        uGlow: { value: 1 },
        uZenith: { value: SKY_ZENITH },
        uHorizon: { value: SKY_HORIZON },
        uSnow: { value: SNOW_SHADOW },
      },
    ]),
  });
  // merge() clones every value, so the House's matrix goes in afterwards
  material.uniforms.uHouse.value = house;
  return material;
}
