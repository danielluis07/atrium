"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BackSide, FogExp2, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, type Vector3 } from "three";

import { afterglowDirection, SKY_HORIZON, SKY_ZENITH, SNOW_SHADOW } from "@/components/scene/palette";

/** Distance fog density (`FogExp2`), per metre; the height fog in `fog.ts` adds to it. */
const FOG_DENSITY = 0.0025;
const FOG_COLOR = SKY_HORIZON.clone().multiplyScalar(0.9);
/** Inside the camera's far plane, or the sky is clipped. */
const SKY_RADIUS = 1500;
/** Inside the PMREM cube camera's far plane (1000). */
const ENVIRONMENT_RADIUS = 400;

const skyVertex = /* glsl */ `
varying vec3 vDirection;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vDirection = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uAfterglow;
varying vec3 vDirection;
void main() {
  vec3 d = normalize( vDirection );
  float h = clamp( d.y, 0.0, 1.0 );
  vec3 c = mix( uHorizon, uZenith, pow( h, 0.55 ) );
  c += uHorizon * 0.9 * pow( max( dot( d, uAfterglow ), 0.0 ), 6.0 ) * ( 1.0 - h );
  c = d.y < 0.0 ? mix( uHorizon, uGround, smoothstep( 0.0, -0.08, d.y ) ) : c;
  gl_FragColor = vec4( c, 1.0 );
}`;

function skyMaterial(afterglow: Vector3) {
  return new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: SKY_ZENITH },
      uHorizon: { value: SKY_HORIZON },
      uGround: { value: SNOW_SHADOW.clone().multiplyScalar(0.6) },
      uAfterglow: { value: afterglow },
    },
  });
}

/**
 * The blue-hour air: a gradient sky dome with the afterglow where the
 * builder's sky has it, the same sky prefiltered as the environment the
 * glass and metal reflect, and the fog.
 */
export function Atmosphere({ north }: { north: number }) {
  const get = useThree((s) => s.get);
  const sky = useMemo(() => skyMaterial(afterglowDirection(north)), [north]);

  useEffect(() => {
    const { gl, scene } = get();
    scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);
    const pmrem = new PMREMGenerator(gl);
    const dome = new Mesh(new SphereGeometry(ENVIRONMENT_RADIUS, 32, 16), sky);
    const environment = pmrem.fromScene(new Scene().add(dome), 0, 0.1, 1000);
    scene.environment = environment.texture;
    return () => {
      scene.fog = null;
      scene.environment = null;
      environment.dispose();
      dome.geometry.dispose();
      pmrem.dispose();
    };
  }, [get, sky]);

  useEffect(() => () => sky.dispose(), [sky]);

  return (
    <mesh material={sky} renderOrder={-1} raycast={() => null}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
    </mesh>
  );
}
