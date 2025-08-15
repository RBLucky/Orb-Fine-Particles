// --- Basic Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("orb-canvas"),
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
camera.position.z = 5;

// --- Camera Controls ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.enableZoom = true;
controls.autoRotate = false;

// --- Mouse Interaction ---
const mouse = new THREE.Vector2(0, 0);
window.addEventListener("mousemove", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});
window.addEventListener("mouseleave", () => {
  mouse.set(0, 0);
});

// --- GLSL Noise Function ---
const glslNoise = `
// 3D Simplex Noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
const vec2 C = vec2(1.0/6.0, 1.0/3.0);
const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
vec3 i = floor(v + dot(v, C.yyy));
vec3 x0 = v - i + dot(i, C.xxx);
vec3 g = step(x0.yzx, x0.xyz);
vec3 l = 1.0 - g;
vec3 i1 = min(g.xyz, l.zxy);
vec3 i2 = max(g.xyz, l.zxy);
vec3 x1 = x0 - i1 + C.xxx;
vec3 x2 = x0 - i2 + C.yyy;
vec3 x3 = x0 - D.yyy;
i = mod289(i);
vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
float n_ = 0.142857142857;
vec3 ns = n_ * D.wyz - D.xzx;
vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
vec4 x_ = floor(j * ns.z);
vec4 y_ = floor(j - 7.0 * x_);
vec4 x = x_ * ns.x + ns.yyyy;
vec4 y = y_ * ns.x + ns.yyyy;
vec4 h = 1.0 - abs(x) - abs(y);
vec4 b0 = vec4(x.xy, y.xy);
vec4 b1 = vec4(x.zw, y.zw);
vec4 s0 = floor(b0) * 2.0 + 1.0;
vec4 s1 = floor(b1) * 2.0 + 1.0;
vec4 sh = -step(h, vec4(0.0));
vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
vec3 p0 = vec3(a0.xy, h.x);
vec3 p1 = vec3(a0.zw, h.y);
vec3 p2 = vec3(a1.xy, h.z);
vec3 p3 = vec3(a1.zw, h.w);
vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
m = m * m;
return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// --- Shaders for Celestial Dust Particles ---
const vertexShader = `
uniform float uTime;
uniform float uAnimationSpeed;
uniform float uDeformationAmount;
varying vec3 vPosition;
varying vec3 vNormal;
${glslNoise}
void main() {
vNormal = normal;
float deformationFrequency = 10.0;
float noise = snoise(position * deformationFrequency + uTime * uAnimationSpeed) * uDeformationAmount;
vec3 newPosition = position + normal * noise;
vPosition = newPosition;
gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(newPosition, 1.0);
}
`;
const fragmentShader = `
uniform float uTime;
uniform float uAnimationSpeed;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uGlowIntensity;
varying vec3 vPosition;
varying vec3 vNormal;
${glslNoise}
float fresnel(float power, vec3 normal, vec3 viewDir) {
return pow(1.0 - dot(normal, viewDir), power);
}
void main() {
float noiseFreq1 = 2.0;
float noiseFreq2 = 8.0;
float noiseSpeed = 0.3 * uAnimationSpeed;
float n1 = snoise(vPosition * noiseFreq1 + uTime * noiseSpeed);
float n2 = snoise(vPosition * noiseFreq2 + uTime * noiseSpeed);
float mixFactor = (n1 + 1.0) * 0.5;
vec3 baseColor = mix(uColor1, uColor2, mixFactor);
vec3 finalColor = mix(baseColor, vec3(0.0), (n2 + 1.0) * 0.5 * 0.3);
vec3 viewDirection = normalize(cameraPosition - vPosition);
float glow = fresnel(3.0, vNormal, viewDirection);
finalColor += glow * uGlowIntensity;
gl_FragColor = vec4(finalColor, 1.0);
}
`;

// --- Instanced Particle Generation ---
const numberOfParticles = 200000;
let particleRadius = 0.0025;
let arrangementRadius = 2.0;
let interactionRadius = 0.5;
const color1 = new THREE.Color(0.6, 0.2, 0.8);
const color2 = new THREE.Color(0.4, 0.1, 0.7);

const particlesData = [];
const dummy = new THREE.Object3D();

let geometry = new THREE.IcosahedronGeometry(particleRadius, 0);
const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uAnimationSpeed: { value: 0.5 },
    uDeformationAmount: { value: 0.05 },
    uGlowIntensity: { value: 0.2 },
    uColor1: { value: color1 },
    uColor2: { value: color2 },
  },
  vertexShader,
  fragmentShader,
});

let instancedMesh = new THREE.InstancedMesh(
  geometry,
  material,
  numberOfParticles
);
scene.add(instancedMesh);

function regenerateParticles() {
  // Clean up old resources
  if (instancedMesh) {
    scene.remove(instancedMesh);
    instancedMesh.geometry.dispose();
    // material is shared, no need to dispose
  }
  particlesData.length = 0;

  // Create new geometry with new radius
  geometry = new THREE.IcosahedronGeometry(particleRadius, 0);
  instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    numberOfParticles
  );

  // Generation Loop
  for (let i = 0; i < numberOfParticles; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = arrangementRadius * Math.cbrt(Math.random());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    particlesData.push({
      restingPosition: new THREE.Vector3(x, y, z),
      currentPosition: new THREE.Vector3(x, y, z),
      repulsion: 1.0 + (Math.random() - 0.5) * 0.2,
      damping: 0.05 + (Math.random() - 0.5) * 0.01,
    });

    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(instancedMesh);
}
regenerateParticles(); // Initial generation

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();
  material.uniforms.uTime.value = elapsedTime;

  particlesData.forEach((particle, i) => {
    const { restingPosition, currentPosition, repulsion, damping } = particle;
    const screenPosition = currentPosition.clone().project(camera);
    const distance = mouse.distanceTo(screenPosition);

    let targetX = restingPosition.x;
    let targetY = restingPosition.y;
    let targetZ = restingPosition.z;

    if (distance < interactionRadius) {
      const repulsionStrength = (1 - distance / interactionRadius) * repulsion;
      const angle = Math.atan2(
        screenPosition.y - mouse.y,
        screenPosition.x - mouse.x
      );
      const repulsionOffsetX = Math.cos(angle) * repulsionStrength;
      const repulsionOffsetY = Math.sin(angle) * repulsionStrength;
      targetX = restingPosition.x + repulsionOffsetX;
      targetY = restingPosition.y + repulsionOffsetY;
    }

    currentPosition.x += (targetX - currentPosition.x) * damping;
    currentPosition.y += (targetY - currentPosition.y) * damping;
    currentPosition.z += (targetZ - currentPosition.z) * damping;

    dummy.position.copy(currentPosition);
    dummy.rotation.set(
      elapsedTime * 0.2 + restingPosition.x,
      elapsedTime * 0.2 + restingPosition.y,
      0
    );
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// --- Handle Window Resizing ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize);

// --- Customizer ---
const allInputs = document.querySelectorAll(".customizer input");

function updateUI(settings) {
  for (const key in settings) {
    const input = document.getElementById(key);
    if (input) {
      input.value = settings[key];
      const valueSpan = document.getElementById(`${key}-value`);
      if (valueSpan) valueSpan.textContent = settings[key];
    }
  }
  // Update colors
  material.uniforms.uColor1.value.set(settings.color1);
  material.uniforms.uColor2.value.set(settings.color2);
  document.body.style.backgroundColor = settings.backgroundColor;
  // Update shader values
  material.uniforms.uAnimationSpeed.value = settings.animationSpeed;
  material.uniforms.uDeformationAmount.value = settings.deformationAmount;
  material.uniforms.uGlowIntensity.value = settings.glowIntensity;
  interactionRadius = parseFloat(settings.interactionRadius);
  // Update particle properties and regenerate if needed
  let needsRegen = false;
  if (particleRadius !== parseFloat(settings.particleSize)) {
    particleRadius = parseFloat(settings.particleSize);
    needsRegen = true;
  }
  if (arrangementRadius !== parseFloat(settings.orbSize)) {
    arrangementRadius = parseFloat(settings.orbSize);
    needsRegen = true;
  }
  if (needsRegen) regenerateParticles();
}

// --- Event Listeners for Controls ---
allInputs.forEach((input) => {
  const valueSpan = document.getElementById(`${input.id}-value`);
  input.addEventListener("input", () => {
    if (valueSpan) valueSpan.textContent = input.value;

    switch (input.id) {
      case "color1":
        material.uniforms.uColor1.value.set(input.value);
        break;
      case "color2":
        material.uniforms.uColor2.value.set(input.value);
        break;
      case "backgroundColor":
        document.body.style.backgroundColor = input.value;
        break;
      case "repulsion":
        particlesData.forEach(
          (p) =>
            (p.repulsion =
              parseFloat(input.value) + (Math.random() - 0.5) * 0.2)
        );
        break;
      case "interactionRadius":
        interactionRadius = parseFloat(input.value);
        break;
      case "animationSpeed":
        material.uniforms.uAnimationSpeed.value = parseFloat(input.value);
        break;
      case "deformationAmount":
        material.uniforms.uDeformationAmount.value = parseFloat(input.value);
        break;
      case "glowIntensity":
        material.uniforms.uGlowIntensity.value = parseFloat(input.value);
        break;
      case "particleSize":
        particleRadius = parseFloat(input.value);
        regenerateParticles();
        break;
      case "orbSize":
        arrangementRadius = parseFloat(input.value);
        regenerateParticles();
        break;
    }
  });
});

// --- Presets ---
const presets = {
  galaxy: {
    color1: "#9933ff",
    color2: "#6619cc",
    backgroundColor: "#000000",
    orbSize: "2.5",
    particleSize: "0.003",
    repulsion: "1.0",
    interactionRadius: "0.5",
    animationSpeed: "0.3",
    deformationAmount: "0.05",
    glowIntensity: "0.3",
  },
  fireball: {
    color1: "#ff4800",
    color2: "#ff8c00",
    backgroundColor: "#100000",
    orbSize: "2.0",
    particleSize: "0.005",
    repulsion: "1.8",
    interactionRadius: "0.8",
    animationSpeed: "1.2",
    deformationAmount: "0.15",
    glowIntensity: "0.5",
  },
  oceanic: {
    color1: "#00ced1",
    color2: "#0077be",
    backgroundColor: "#020a1c",
    orbSize: "3.0",
    particleSize: "0.004",
    repulsion: "0.5",
    interactionRadius: "0.6",
    animationSpeed: "0.2",
    deformationAmount: "0.1",
    glowIntensity: "0.1",
  },
};

document
  .getElementById("preset-galaxy")
  .addEventListener("click", () => updateUI(presets.galaxy));
document
  .getElementById("preset-fireball")
  .addEventListener("click", () => updateUI(presets.fireball));
document
  .getElementById("preset-oceanic")
  .addEventListener("click", () => updateUI(presets.oceanic));

// --- Toggle Customizer ---
const toggleButton = document.querySelector(".toggle-customizer");
const customizerContent = document.querySelector(".customizer-content");
toggleButton.addEventListener("click", () => {
  const isHidden = customizerContent.style.display === "none";
  customizerContent.style.display = isHidden ? "block" : "none";
  toggleButton.textContent = isHidden ? "-" : "+";
});

// --- Start the animation ---
animate();
