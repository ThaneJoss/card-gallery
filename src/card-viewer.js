import * as THREE from 'three';
import { createCardTextureMapping } from './card-texture.mjs';

const FINISHES = {
  matte: { roughness: .95, metalness: 0, specularIntensity: .12, clearcoat: 0, clearcoatRoughness: 1, iridescence: 0, envMapIntensity: .85 },
  gloss: { roughness: .2, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: .045, iridescence: 0, envMapIntensity: 1.15 },
  iridescent: { roughness: .24, metalness: .55, specularIntensity: 1, clearcoat: .25, clearcoatRoughness: .12, iridescence: 1, envMapIntensity: 1.35 },
};

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
export function createCardViewer({ container, finish = 'matte', onFinishChange = () => {} }) {
  if (!Object.hasOwn(FINISHES, finish)) throw new RangeError('未知卡片材质');
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  let renderer, observer, canvas, animation = 0, disposed = false, drag = null, cardRequest = 0;
  const events = new AbortController();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cardRequest++;
    cancelAnimationFrame(animation);
    observer?.disconnect();
    events.abort();
    if (drag && canvas?.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    for (const resource of resources) resource.dispose();
    resources.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    canvas?.remove();
  }

  try {
    const width = 8.53, height = 5.4, corner = .28;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    canvas = renderer.domElement;
    canvas.className = 'card-viewer-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '银行卡的三维预览。拖动或使用方向键环绕查看，Home 键复位。');
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    const card = new THREE.Group();
    card.visible = false;
    scene.add(card);
    const initialOrbit = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.17, -.35, .025)).invert();
    const orbit = initialOrbit.clone();
    const turn = new THREE.Quaternion(), axis = new THREE.Vector3();
    let radius = 17;

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

    const bodyGeometry = own(new THREE.ExtrudeGeometry(roundedRectangle(width - .01, height - .01, corner - .01), {
      depth: .076, bevelEnabled: true, bevelThickness: .02, bevelSize: .02,
      bevelSegments: 3, steps: 1, curveSegments: 16,
    }));
    bodyGeometry.translate(0, 0, -.038);
    const edgeMaterial = own(new THREE.MeshStandardMaterial({ color: 0xc3d3cd, metalness: .25, roughness: .32 }));
    card.add(new THREE.Mesh(bodyGeometry, edgeMaterial));

    const faceGeometry = own(new THREE.ShapeGeometry(roundedRectangle(width, height, corner), 24));
    const positions = faceGeometry.attributes.position, uv = faceGeometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, (positions.getX(i) + width / 2) / width, (positions.getY(i) + height / 2) / height);
    }
    const frontMaterial = own(new THREE.MeshPhysicalMaterial({ transparent: true }));
    const textureProjection = new THREE.Matrix3();
    frontMaterial.onBeforeCompile = shader => {
      shader.uniforms.cardTextureProjection = { value: textureProjection };
      const projectedMap = THREE.ShaderChunk.map_fragment.replace(
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
        'vec3 cardUv = cardTextureProjection * vec3( vMapUv, 1.0 );\n\tvec4 sampledDiffuseColor = texture2D( map, cardUv.xy / cardUv.z );',
      );
      shader.fragmentShader = 'uniform mat3 cardTextureProjection;\n' + shader.fragmentShader.replace('#include <map_fragment>', projectedMap);
    };
    frontMaterial.customProgramCacheKey = () => 'card-projective-texture-v1';
    const backMaterial = own(new THREE.MeshPhysicalMaterial({ color: 0xc9d7d2 }));
    const front = new THREE.Mesh(faceGeometry, frontMaterial);
    front.position.z = .061;
    card.add(front);
    const back = new THREE.Mesh(faceGeometry, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -.061;
    card.add(back);

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
      surface.setValues(FINISHES[finish]);
    }

    function render() {
      if (disposed) return;
      camera.position.set(0, 0, radius).applyQuaternion(orbit);
      camera.quaternion.copy(orbit);
      camera.up.set(0, 1, 0).applyQuaternion(orbit);
      renderer.render(scene, camera);
    }
    const boundingRadius = Math.hypot(width / 2 + .025, height / 2 + .025, .061);
    function resize() {
      if (disposed) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
      radius = boundingRadius * 1.04 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
      camera.far = Math.max(100, radius + boundingRadius * 2);
      camera.updateProjectionMatrix();
      render();
    }
    function stopAnimation() { cancelAnimationFrame(animation); animation = 0; }
    // Geometry is shared for the lifetime of this viewer; cards only replace its texture.
    async function setCard({ image, name, textureCorners }) {
      if (disposed) return false;
      const request = ++cardRequest;
      let texture;
      try {
        texture = await new THREE.TextureLoader().loadAsync(image);
      } catch (error) {
        if (disposed || request !== cardRequest) return false;
        throw error;
      }
      if (disposed || request !== cardRequest) {
        texture.dispose();
        return false;
      }
      let mapping;
      try {
        mapping = createCardTextureMapping({
          width: texture.image.naturalWidth || texture.image.width,
          height: texture.image.naturalHeight || texture.image.height,
          textureCorners,
        });
      } catch (error) {
        texture.dispose();
        throw error;
      }
      textureProjection.set(...mapping.projection);
      card.rotation.z = mapping.portrait ? Math.PI / 2 : 0;
      card.visible = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const previous = frontMaterial.map;
      frontMaterial.map = own(texture);
      frontMaterial.needsUpdate = true;
      if (previous) { previous.dispose(); resources.delete(previous); }
      canvas.setAttribute('aria-label', `${name || '银行卡'}的三维预览。拖动或使用方向键环绕查看，Home 键复位。`);
      render();
      return true;
    }
    function clearCard() {
      if (disposed) return;
      cardRequest++;
      stopAnimation();
      orbit.copy(initialOrbit);
      card.rotation.z = 0;
      card.visible = false;
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
      drag = null;
      const previous = frontMaterial.map;
      frontMaterial.map = null;
      frontMaterial.needsUpdate = true;
      if (previous) { previous.dispose(); resources.delete(previous); }
      canvas.setAttribute('aria-label', '银行卡的三维预览。拖动或使用方向键环绕查看，Home 键复位。');
      render();
    }
    function setFinish(nextFinish) {
      if (disposed) return;
      if (!Object.hasOwn(FINISHES, nextFinish)) throw new RangeError('未知卡片材质');
      frontMaterial.setValues(FINISHES[nextFinish]);
      backMaterial.setValues(FINISHES[nextFinish]);
      finish = nextFinish;
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

    const eventOptions = { signal: events.signal };
    canvas.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0) return;
      stopAnimation();
      canvas.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    }, eventOptions);
    canvas.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const distance = Math.hypot(dx, dy);
      if (!distance) return;
      axis.set(-dy, -dx, 0).normalize();
      turn.setFromAxisAngle(axis, distance * Math.PI / Math.min(container.clientWidth, container.clientHeight));
      orbit.multiply(turn).normalize();
      render();
    }, eventOptions);
    function finishDrag(event) { if (drag?.id === event.pointerId) drag = null; }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, finishDrag, eventOptions);
    canvas.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Home') { event.preventDefault(); resetView(); return; }
      const axes = { ArrowLeft: [0, 1, 0], ArrowRight: [0, -1, 0], ArrowUp: [1, 0, 0], ArrowDown: [-1, 0, 0] };
      if (!Object.hasOwn(axes, event.key)) return;
      event.preventDefault();
      stopAnimation();
      axis.fromArray(axes[event.key]);
      turn.setFromAxisAngle(axis, Math.PI / 12);
      orbit.multiply(turn).normalize();
      render();
    }, eventOptions);

    observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return { setCard, clearCard, setFinish, flip, resetView, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
