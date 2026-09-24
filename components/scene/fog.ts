import { ShaderChunk } from "three";

import { WATER_LEVEL } from "@/lib/scene/terrain";

/**
 * Height and distance fog for every material that fogs (built-in, GLB and
 * `ShaderMaterial` with `fog: true`), by replacing three's fog chunks before
 * anything compiles. Distance fog keeps `FogExp2`'s meaning; on top of it,
 * the analytic integral of exponential height fog along the view ray, so the
 * air pools thick over the fjord and thins up the slope
 * (`docs/research/scene-rendering.md` §4).
 */

/** Height fog density at the water, per metre. */
const HEIGHT_DENSITY = 0.01;
/** How quickly it thins with height, per metre. */
const HEIGHT_FALLOFF = 0.08;

const f = (v: number) => v.toFixed(5);

ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRay;
#endif`;

// The ray from the camera in world axes: view space turned back by the view matrix's rotation.
ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;

ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDistance = length( vFogRay );
  #ifdef FOG_EXP2
    float fogRise = vFogRay.y;
    float fogHeight = ${f(HEIGHT_DENSITY)} * exp( -${f(HEIGHT_FALLOFF)} * ( cameraPosition.y - ${f(WATER_LEVEL)} ) );
    fogHeight *= abs( fogRise ) > 1e-3
      ? fogDistance * ( 1.0 - exp( -${f(HEIGHT_FALLOFF)} * fogRise ) ) / ( ${f(HEIGHT_FALLOFF)} * fogRise )
      : fogDistance;
    float fogFactor = 1.0 - exp( -fogDensity * fogDensity * fogDistance * fogDistance - fogHeight );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fogDistance );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
