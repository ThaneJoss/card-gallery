import * as THREE from 'three';
import { createCardTextureMapping } from './card-texture.mjs';
import { CARD_SHAPE, fitCardCamera } from './card-presentation.mjs';
import { layerPlacement } from './card-studio.mjs';

const FINISHES = {
  original: null,
  matte: { roughness: .95, metalness: 0, specularIntensity: .12, clearcoat: 0, clearcoatRoughness: 1, iridescence: 0, envMapIntensity: .85 },
  gloss: { roughness: .2, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: .045, iridescence: 0, envMapIntensity: 1.15 },
  iridescent: { roughness: .24, metalness: .55, specularIntensity: 1, clearcoat: .25, clearcoatRoughness: .12, iridescence: 1, envMapIntensity: 1.35 },
};

// Keep recently viewed GPU textures without growing with the whole collection.
const TEXTURE_CACHE_BYTES = 96 * 1024 * 1024;

function roundedRectangle(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** Creates one on-demand viewer. The caller owns the surrounding controls. */
export function createCardViewer({ container, finish = 'original', onFinishChange = () => {} }) {
  if (!Object.hasOwn(FINISHES, finish)) throw new RangeError('未知卡片材质');
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const textures = new Map();
  const pendingTextures = new Map();
  let textureBytes = 0;
  let renderer, observer, canvas, animation = 0, disposed = false, cardRequest = 0;
  let requestedImages = new Set(), activeImages = new Set();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cardRequest++;
    requestedImages.clear();
    activeImages.clear();
    cancelAnimationFrame(animation);
    observer?.disconnect();
    for (const resource of resources) resource.dispose();
    resources.clear();
    textures.clear();
    pendingTextures.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    canvas?.remove();
  }

  try {
    const { width, height, corner, faceZ } = CARD_SHAPE;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    canvas = renderer.domElement;
    canvas.className = 'card-viewer-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('aria-label', '银行卡的三维预览。拖动或使用方向键环绕查看，Home 键复位。');
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(10, 1, .1, 100);
    const card = new THREE.Group();
    card.visible = false;
    scene.add(card);
    const initialOrbit = new THREE.Quaternion();
    const orbit = initialOrbit.clone();
    const turn = new THREE.Quaternion(), axis = new THREE.Vector3();
    let portrait = false;
    const inverseOrbit = new THREE.Quaternion(), projectedPoint = new THREE.Vector3();
    const bounds = [];
    for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-faceZ, faceZ]) bounds.push(new THREE.Vector3(x, y, z));

    // The studio and card remain fixed; only the camera orbits.
    const environment = new THREE.Scene();
    environment.background = new THREE.Color(.12, .12, .12);
    const temporaryResources = [];
    for (const side of [1, -1]) {
      const geometry = own(new THREE.PlaneGeometry(2.2, 9));
      const material = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(12) }));
      temporaryResources.push(geometry, material);
      const softbox = new THREE.Mesh(geometry, material);
      softbox.position.set(-3.2 * side, 1.6 * side, 8 * side);
      softbox.lookAt(0, 0, 0);
      environment.add(softbox);
    }
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      const environmentTarget = own(generator.fromScene(environment, .025));
      scene.environment = environmentTarget.texture;
    } finally {
      generator.dispose();
      for (const resource of temporaryResources) { resource.dispose(); resources.delete(resource); }
    }
    scene.add(new THREE.AmbientLight(0xffffff, .35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(3, -2, -8);
    scene.add(fill);

    // The bevel expands the outline by .02 cm on each side; keep it inside the face.
    const bodyGeometry = own(new THREE.ExtrudeGeometry(roundedRectangle(width - .04, height - .04, corner - .02), {
      depth: .076, bevelEnabled: true, bevelThickness: .02, bevelSize: .02,
      bevelSegments: 3, steps: 1, curveSegments: 16,
    }));
    bodyGeometry.translate(0, 0, -.038);
    const edgeMaterial = own(new THREE.MeshStandardMaterial({ color: 0xc3d3cd, metalness: .25, roughness: .32 }));
    const originalEdge = own(new THREE.MeshBasicMaterial({ color: 0xc9d7d2, toneMapped: false }));
    const body = new THREE.Mesh(bodyGeometry, originalEdge);
    card.add(body);

    const faceGeometry = own(new THREE.ShapeGeometry(roundedRectangle(width, height, corner), 24));
    const positions = faceGeometry.attributes.position, uv = faceGeometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, (positions.getX(i) + width / 2) / width, (positions.getY(i) + height / 2) / height);
    }
    const frontMaterial = own(new THREE.MeshPhysicalMaterial({ transparent: true }));
    const originalFront = own(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    const textureProjection = new THREE.Matrix3();
    const projectTexture = shader => {
      shader.uniforms.cardTextureProjection = { value: textureProjection };
      const projectedMap = THREE.ShaderChunk.map_fragment.replace(
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
        `vec3 cardUv = cardTextureProjection * vec3( vMapUv, 1.0 );
        vec4 sampledDiffuseColor = texture2D( map, cardUv.xy / cardUv.z );
        // Filter in the image's sRGB space, then decode for lighting.
        sampledDiffuseColor.rgb = mix(
          pow((sampledDiffuseColor.rgb + vec3(0.055)) / 1.055, vec3(2.4)),
          sampledDiffuseColor.rgb / 12.92,
          vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045)))
        );`,
      );
      shader.fragmentShader = 'uniform mat3 cardTextureProjection;\n' + shader.fragmentShader.replace('#include <map_fragment>', projectedMap);
    };
    for (const material of [frontMaterial, originalFront]) {
      material.onBeforeCompile = projectTexture;
      material.customProgramCacheKey = () => 'card-projective-srgb-texture-v2';
    }
    const backMaterial = own(new THREE.MeshPhysicalMaterial({ color: 0xc9d7d2 }));
    const originalBack = own(new THREE.MeshBasicMaterial({ color: 0xc9d7d2, toneMapped: false }));
    const front = new THREE.Mesh(faceGeometry, originalFront);
    front.position.z = faceZ;
    card.add(front);
    const back = new THREE.Mesh(faceGeometry, originalBack);
    back.rotation.y = Math.PI;
    back.position.z = -faceZ;
    card.add(back);

    const layerRoot = new THREE.Group();
    card.add(layerRoot);
    const layerGeometry = own(new THREE.PlaneGeometry(1, 1));
    const layerPool = [];
    let currentLayers = [], layerBounds = [], layerSpacing = .55;

    function layoutLayers() {
      layerBounds = [];
      currentLayers.forEach(({ mesh }, index) => {
        mesh.position.z = faceZ + .004 + layerSpacing * (.3 + index * .12);
        if (!mesh.visible) return;
        for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
          layerBounds.push(new THREE.Vector3(mesh.position.x + x * mesh.scale.x,
            mesh.position.y + y * mesh.scale.y, mesh.position.z).applyQuaternion(layerRoot.quaternion));
        }
      });
    }
    function setLayerSpacing(value) {
      layerSpacing = Math.max(0, Math.min(1, value));
      layoutLayers();
      render();
    }
    function setLayerVisibility(id, visible) {
      const layer = currentLayers.find(item => item.id === id);
      if (!layer) return;
      layer.mesh.visible = visible;
      layoutLayers();
      render();
    }

    const filmSize = 128, filmPixels = new Uint8Array(filmSize * filmSize * 4);
    for (let y = 0; y < filmSize; y++) for (let x = 0; x < filmSize; x++) {
      const i = (y * filmSize + x) * 4;
      filmPixels[i] = 255;
      filmPixels[i + 1] = Math.round(255 * (.12 + .76 * (.72 * x + .28 * y) / (filmSize - 1)));
      filmPixels[i + 2] = 255;
      filmPixels[i + 3] = 255;
    }
    const filmThickness = own(new THREE.DataTexture(filmPixels, filmSize, filmSize));
    filmThickness.magFilter = THREE.LinearFilter;
    filmThickness.minFilter = THREE.LinearFilter;
    filmThickness.needsUpdate = true;
    for (const surface of [frontMaterial, backMaterial]) {
      surface.iridescenceThicknessMap = filmThickness;
      surface.iridescenceThicknessRange = [120, 780];
      surface.iridescenceIOR = 1.8;
    }
    applyFinish();

    function render() {
      if (disposed) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      const { distance, tangent, fov } = fitCardCamera(w, h, portrait);
      camera.fov = fov;
      camera.zoom = 1;
      inverseOrbit.copy(orbit).invert();
      // Keep the viewing distance stable. Widen framing only to avoid clipping a rotated card.
      for (const point of [...bounds, ...layerBounds]) {
        projectedPoint.copy(point).applyQuaternion(card.quaternion).applyQuaternion(inverseOrbit);
        const depth = distance - projectedPoint.z;
        camera.zoom = Math.min(camera.zoom, depth * tangent * (w - 48) / (Math.abs(projectedPoint.x) * h),
          depth * tangent * (h - 48) / (Math.abs(projectedPoint.y) * h));
      }
      camera.position.set(0, 0, distance).applyQuaternion(orbit);
      camera.quaternion.copy(orbit);
      camera.up.set(0, 1, 0).applyQuaternion(orbit);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    function resize() {
      if (disposed) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    }
    function stopAnimation() { cancelAnimationFrame(animation); animation = 0; }
    function loadTexture(image) {
      if (!pendingTextures.has(image)) {
        const loading = new THREE.TextureLoader().loadAsync(image).then(texture => {
          if (disposed) { texture.dispose(); return null; }
          // Both face shaders decode sRGB after filtering; layer maps opt into sRGB separately.
          texture.colorSpace = THREE.NoColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          // A base image can finish before its layers. Share it immediately with a newer view.
          cacheTexture(image, texture);
          trimTextureCache();
          return texture;
        }).finally(() => pendingTextures.delete(image));
        pendingTextures.set(image, loading);
      }
      return pendingTextures.get(image);
    }
    function cacheTexture(image, texture) {
      if (!textures.has(image)) {
        own(texture);
        textureBytes += texture.image.width * texture.image.height * 4 * 4 / 3;
      }
      textures.delete(image);
      textures.set(image, texture);
    }
    function trimTextureCache() {
      // Retain every texture of the visible card, including its transparent layers.
      for (const [oldImage, oldTexture] of textures) {
        if (textureBytes <= TEXTURE_CACHE_BYTES) break;
        if (activeImages.has(oldImage) || requestedImages.has(oldImage)) continue;
        textures.delete(oldImage);
        textureBytes -= oldTexture.image.width * oldTexture.image.height * 4 * 4 / 3;
        oldTexture.dispose();
        resources.delete(oldTexture);
      }
    }
    // Geometry is shared for the lifetime of this viewer; cards only replace its texture.
    async function setCard({ image, name, textureCorners, layers = [] }) {
      if (disposed) return false;
      const request = ++cardRequest;
      const images = [...new Set([image, ...layers.map(layer => layer.image)])];
      requestedImages = new Set(images);
      const loaded = await Promise.allSettled(images.map(url => textures.get(url) || loadTexture(url)));
      if (disposed || request !== cardRequest) {
        return false;
      }
      const failure = loaded.find(result => result.status === 'rejected');
      if (failure) {
        requestedImages.clear();
        trimTextureCache();
        throw failure.reason;
      }
      const texture = loaded[0].value;
      let mapping;
      try {
        mapping = createCardTextureMapping({
          width: texture.image.naturalWidth || texture.image.width,
          height: texture.image.naturalHeight || texture.image.height,
          textureCorners,
        });
      } catch (error) {
        requestedImages.clear();
        trimTextureCache();
        throw error;
      }
      textureProjection.set(...mapping.projection);
      portrait = mapping.portrait;
      container.classList.toggle('is-portrait', portrait);
      card.rotation.z = portrait ? Math.PI / 2 : 0;
      card.visible = true;
      for (const material of [frontMaterial, originalFront]) {
        if (!material.map) material.needsUpdate = true;
        material.map = texture;
      }
      activeImages = new Set(images);
      loaded.forEach((result, index) => cacheTexture(images[index], result.value));
      layerRoot.rotation.z = portrait ? -Math.PI / 2 : 0;
      layerPool.forEach(mesh => { mesh.visible = false; mesh.material.map = null; });
      currentLayers = layers.map((layer, index) => {
        if (!layerPool[index]) {
          const material = own(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false,
            depthWrite: false, alphaTest: .01 }));
          const mesh = new THREE.Mesh(layerGeometry, material);
          // Transparent objects are otherwise sorted by their centres: a tilted
          // card face could paint over a raised logo near its far edge.
          mesh.renderOrder = index + 1;
          layerPool.push(mesh);
          layerRoot.add(mesh);
        }
        const mesh = layerPool[index], position = layerPlacement(layer.box, portrait);
        const layerTexture = textures.get(layer.image);
        layerTexture.colorSpace = THREE.SRGBColorSpace;
        if (!mesh.material.map) mesh.material.needsUpdate = true;
        mesh.material.map = layerTexture;
        mesh.position.set(position.x, position.y, 0);
        mesh.scale.set(position.width, position.height, 1);
        mesh.visible = true;
        return { id: layer.id, mesh };
      });
      layoutLayers();
      trimTextureCache();
      canvas.setAttribute('aria-label', `${name || '银行卡'}的三维预览。拖动或使用方向键环绕查看，Home 键复位。`);
      render();
      return true;
    }
    function clearCard() {
      if (disposed) return;
      cardRequest++;
      requestedImages.clear();
      activeImages.clear();
      stopAnimation();
      orbit.copy(initialOrbit);
      card.rotation.z = 0;
      card.visible = false;
      container.classList.remove('is-portrait');
      currentLayers = [];
      layerBounds = [];
      layerPool.forEach(mesh => { mesh.visible = false; mesh.material.map = null; });
      canvas.setAttribute('aria-label', '银行卡的三维预览。拖动或使用方向键环绕查看，Home 键复位。');
      render();
    }
    function applyFinish() {
      const original = finish === 'original';
      front.material = original ? originalFront : frontMaterial;
      back.material = original ? originalBack : backMaterial;
      body.material = original ? originalEdge : edgeMaterial;
      if (!original) {
        frontMaterial.setValues(FINISHES[finish]);
        backMaterial.setValues(FINISHES[finish]);
      }
    }
    function setFinish(nextFinish) {
      if (disposed) return;
      if (!Object.hasOwn(FINISHES, nextFinish)) throw new RangeError('未知卡片材质');
      finish = nextFinish;
      applyFinish();
      render();
      onFinishChange(nextFinish);
    }
    function resetView() {
      if (disposed) return;
      stopAnimation();
      orbit.copy(initialOrbit);
      render();
    }
    function flip() {
      if (disposed) return;
      stopAnimation();
      const from = orbit.clone(), start = performance.now();
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
      const flipAxis = new THREE.Vector3(0, 1, 0), flipTurn = new THREE.Quaternion();
      function step(now) {
        if (disposed) return;
        const progress = duration ? Math.min(1, (now - start) / duration) : 1;
        flipTurn.setFromAxisAngle(flipAxis, Math.PI * progress * progress * (3 - 2 * progress));
        orbit.copy(from).multiply(flipTurn).normalize();
        render();
        animation = progress < 1 ? requestAnimationFrame(step) : 0;
      }
      if (duration) animation = requestAnimationFrame(step);
      else step(start);
    }

    function rotate(rotations) {
      if (disposed) return;
      stopAnimation();
      for (const { x, y, angle } of rotations) {
        axis.set(x, y, 0).normalize();
        turn.setFromAxisAngle(axis, angle);
        orbit.multiply(turn).normalize();
      }
      render();
    }

    observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return { setCard, clearCard, setFinish, flip, resetView, rotate, setLayerSpacing, setLayerVisibility, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
