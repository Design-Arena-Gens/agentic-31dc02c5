"use client";
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function BlackHole() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const container = containerRef.current!;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector3(container.clientWidth, container.clientHeight, 1) },
        rs: { value: 1.0 }, // Schwarzschild radius (unit)
        camDistance: { value: 8.0 },
        diskInner: { value: 1.2 }, // > rs
        diskOuter: { value: 8.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;

        uniform float iTime;
        uniform vec3 iResolution;
        uniform float rs;           // Schwarzschild radius r_s = 2GM/c^2
        uniform float camDistance;  // camera distance on +z
        uniform float diskInner;    // inner radius of accretion disk (in r_s units)
        uniform float diskOuter;    // outer radius of disk

        // Utility
        #define TAU 6.28318530718

        // Pseudo-random for stars
        float hash13(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p += dot(p, p.yzx + 19.19);
          return fract(p.x * p.y * p.z);
        }

        // Rotate vector v around axis by angle using Rodrigues' formula
        vec3 rotateAround(vec3 v, vec3 axis, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }

        // Background starfield based on direction
        vec3 starfield(vec3 dir) {
          // map direction to cube-like space for randomness
          vec3 p = normalize(dir) * 123.0;
          float d = smoothstep(0.995, 1.0, hash13(floor(p * 20.0)));
          float m = pow(d, 24.0);
          vec3 col = vec3(0.6 + 0.4 * hash13(p + 1.0), 0.7 + 0.3 * hash13(p + 2.0), 1.0) * m;
          // subtle nebula
          float n = hash13(floor(dir * 10.0));
          col += vec3(0.02, 0.01, 0.03) * n;
          return col;
        }

        // Simple beamed accretion disk color
        vec3 diskColor(vec3 pos, vec3 dir) {
          // Disk lies on y=0 plane, rotates around +y axis
          float r = length(pos.xz);
          if (r < diskInner || r > diskOuter) return vec3(0.0);

          // Keplerian orbital speed v = sqrt(GM/r). In our units, rs=2GM/c^2 => GM = rs*c^2/2
          // Set c=1 for units, then v ~ sqrt(rs/(2*r)). Clamp to < 0.6 for visuals.
          float v = clamp(sqrt(rs / (2.0 * r)), 0.0, 0.6);
          vec3 tangential = normalize(vec3(-pos.z, 0.0, pos.x));

          float cosTheta = dot(tangential, -dir);
          float doppler = pow((1.0 - v * cosTheta) / sqrt(1.0 - v*v), -3.0);

          // radial temperature gradient (hotter near inner radius)
          float t = clamp((diskOuter - r) / (diskOuter - diskInner), 0.0, 1.0);
          vec3 base = mix(vec3(0.8, 0.4, 0.1), vec3(1.0, 0.95, 0.85), pow(t, 0.6));

          return base * doppler * 0.6;
        }

        // Weak-field analytic bending approximation:
        // alpha = 2*rs / b, where b is impact parameter = |r x v| / |v| for incoming ray
        // We treat ray as coming from camera at (0,0,camDistance) towards scene.
        // If b < b_c ~ (3*sqrt(3)/2)*rs, the ray is captured -> black hole shadow.
        vec3 bendRay(vec3 ro, vec3 rd, float rs_local, out float capture) {
          // angular momentum magnitude per unit energy for straight line: b = |r x v| (|v|=1)
          float b = length(cross(ro, rd));
          float bc = 2.59807621135 * rs_local; // (3*sqrt(3)/2) * rs
          if (b < bc) {
            capture = 1.0;
            return rd;
          }
          capture = 0.0;
          float alpha = 2.0 * rs_local / max(b, 1e-5);
          vec3 axis = normalize(cross(ro, rd));
          return rotateAround(rd, axis, alpha);
        }

        // Intersect plane y=0 with ray
        bool intersectDisk(vec3 ro, vec3 rd, out vec3 hit) {
          float t = -ro.y / (rd.y + 1e-6);
          if (t <= 0.0) return false;
          hit = ro + rd * t;
          return true;
        }

        void main() {
          vec2 uv = (gl_FragCoord.xy / iResolution.xy) * 2.0 - 1.0;
          uv.x *= iResolution.x / iResolution.y;

          // Camera setup
          vec3 ro = vec3(0.0, 0.0, camDistance);
          vec3 rd = normalize(vec3(uv, -1.5));

          // Bend the ray once (weak field approx), mark capture if within critical b
          float captured;
          vec3 rd2 = bendRay(ro, rd, rs, captured);

          // Event horizon/black hole shadow
          if (captured > 0.5) {
            // soft edge using distance to critical impact parameter
            float b = length(cross(ro, rd));
            float bc = 2.59807621135 * rs;
            float edge = smoothstep(bc * 0.9, bc * 1.05, b);
            gl_FragColor = vec4(vec3(0.0), 1.0) * (1.0 - (1.0 - edge) * 0.06);
            return;
          }

          // Background through lensed direction
          vec3 bg = starfield(rd2);

          // Approximate general-relativistic light bending for disk: trace bent ray to y=0
          vec3 hit;
          vec3 col = bg;
          if (intersectDisk(ro, rd2, hit)) {
            float r = length(hit.xz);
            // Avoid rendering inside the photon sphere projection
            if (r > 1.05 * rs) {
              vec3 dcol = diskColor(hit, rd2);
              // Gravitational redshift factor for emitted light: z_g ~ 1 / sqrt(1 - rs/r) - 1
              float redshift = sqrt(max(1.0 - rs / max(r, 1e-3), 0.0001));
              dcol *= redshift;
              // Blend disk over background with soft alpha
              float alpha = smoothstep(diskOuter, diskInner, r) * 0.85;
              col = mix(col, dcol, alpha);
            }
          }

          // Subtle glow around photon ring
          float b = length(cross(ro, rd));
          float bc = 2.59807621135 * rs;
          float ring = exp(-30.0 * abs(b - bc));
          col += vec3(1.0, 0.9, 0.7) * ring * 0.35;

          // Vignette
          float vig = smoothstep(1.4, 0.1, length(uv));
          col *= mix(0.6, 1.0, vig);

          // Tone map
          col = col / (col + 1.0);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    sceneRef.current = scene;
    cameraRef.current = camera;
    materialRef.current = material;
    rendererRef.current = renderer;

    let raf = 0;
    const onResize = () => {
      if (!rendererRef.current || !materialRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      rendererRef.current.setSize(w, h);
      materialRef.current.uniforms.iResolution.value.set(w, h, 1);
    };

    const tick = (t: number) => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !materialRef.current) return;
      materialRef.current.uniforms.iTime.value = t * 0.001;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('resize', onResize);
    onResize();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current = null;
      }
      materialRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="canvasRoot" />;
}
