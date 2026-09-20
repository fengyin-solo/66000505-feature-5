<template>
  <div class="panel">
    <h3>🏔️ 3D函数曲面 + 优化轨迹</h3>
    <div ref="container" class="viewer3d"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useOptimizationStore } from '../store/optimization'

const store = useOptimizationStore()
const container = ref<HTMLDivElement>()
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls, animId: number
let surfaceGroup = new THREE.Group(), pathGroup = new THREE.Group()

function initScene() {
  const c = container.value!; scene = new THREE.Scene(); scene.background = new THREE.Color(0x111827)
  camera = new THREE.PerspectiveCamera(45, c.clientWidth/c.clientHeight, 0.1, 50); camera.position.set(4, 4, 5)
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(c.clientWidth, c.clientHeight)
  c.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
  scene.add(new THREE.AmbientLight(0x404060, 1.5))
  const dl = new THREE.DirectionalLight(0xffffff, 1); dl.position.set(3, 4, 3); scene.add(dl)
  const dl2 = new THREE.DirectionalLight(0x6688cc, 0.4); dl2.position.set(-3, -2, -2); scene.add(dl2)
  scene.add(surfaceGroup); scene.add(pathGroup)
}
function buildSurface() {
  surfaceGroup.clear(); pathGroup.clear()
  // 未算出的步只跳过不画
  const path = store.validPath; if (!path.length) return
  const xs = path.map(p => p.x as number), ys = path.map(p => p.y as number), zs = path.map(p => p.z as number)
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys)
  const zMin = Math.min(...zs), zMax = Math.max(...zs)
  const px = xMax - xMin || 1, py = yMax - yMin || 1, pz = zMax - zMin || 1
  const scale = 3
  const map = (x: number) => ((x - xMin) / px - 0.5) * scale
  const mapy = (y: number) => ((y - yMin) / py - 0.5) * scale
  const mapz = (z: number) => ((z - zMin) / pz) * 2

  // Surface points as scattered dots
  const geom = new THREE.BufferGeometry()
  const positions: number[] = [], colors: number[] = []
  for (const pt of path) {
    positions.push(map(pt.x as number), mapz(pt.z as number), mapy(pt.y as number))
    const t = ((pt.z as number) - zMin) / pz
    colors.push(t, 0.3 * (1 - t), 1 - t)
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false })
  surfaceGroup.add(new THREE.Points(geom, mat))

  // Path line up to current frame
  const animPath = store.currentPath
  if (animPath.length > 1) {
    const lineGeom = new THREE.BufferGeometry()
    const pts: number[] = []
    for (const pt of animPath) pts.push(map(pt.x as number), mapz(pt.z as number), mapy(pt.y as number))
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    pathGroup.add(new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0x00ffcc })))
  }

  // Start/current/end markers
  const marker = (x: number, y: number, z: number, color: number, size = 0.12) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 }))
    s.position.set(x, z, y); pathGroup.add(s)
  }
  if (path.length) {
    const first = path[0]; marker(map(first.x as number), mapy(first.y as number), mapz(first.z as number), 0x4fc3f7, 0.14)
    const cur = store.currentPoint
    if (cur) marker(map(cur.x as number), mapy(cur.y as number), mapz(cur.z as number), 0x66bb6a, 0.12)
    const last = path[path.length - 1]; marker(map(last.x as number), mapy(last.y as number), mapz(last.z as number), 0xef5350, 0.14)
    const best = store.bestInRange
    if (best) {
      // 金色圆环标记当前区间最优步
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.02, 12, 32),
        new THREE.MeshBasicMaterial({ color: 0xf5a623 })
      )
      ring.position.set(map(best.x as number), mapz(best.z as number), mapy(best.y as number))
      ring.rotation.x = Math.PI / 2
      pathGroup.add(ring)
    }
  }
}
function animate() { animId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera) }
onMounted(() => { initScene(); buildSurface(); animate() })
watch(() => [store.result, store.animationStep, store.rangeStart, store.rangeEnd], buildSurface, { deep: true })
onUnmounted(() => { cancelAnimationFrame(animId); renderer?.dispose() })
</script>

<style scoped>
.panel { background:#fff; border-radius:8px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,.06) }
.panel h3 { margin-bottom:8px; color:#333; font-size:14px }
.viewer3d { width:100%; height:360px; border-radius:8px; overflow:hidden; border:1px solid #eee }
</style>
