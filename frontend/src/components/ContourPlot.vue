<template>
  <div class="panel">
    <h3>🗺️ 2D等高线 + 优化路径</h3>
    <canvas ref="cvs" width="400" height="400" class="contour-canvas"></canvas>
    <div class="info">🔵 起点 🟢 当前步 🔴 终点 ⭐ 区间最优步</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useOptimizationStore } from '../store/optimization'
const store = useOptimizationStore()
const cvs = ref<HTMLCanvasElement>()

function draw() {
  const c = cvs.value!; const ctx = c.getContext('2d')!; const W = c.width, H = c.height
  ctx.clearRect(0, 0, W, H)

  // Fill background
  ctx.fillStyle = '#0a1929'; ctx.fillRect(0, 0, W, H)

  // 未算出的步只跳过不画
  const path = store.validPath
  if (path.length === 0) return

  // Find ranges
  const xs = path.map(p => p.x as number), ys = path.map(p => p.y as number)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const padX = (xMax - xMin) * 0.2 || 1
  const padY = (yMax - yMin) * 0.2 || 1
  const rx = xMin - padX, ry = yMin - padY, rw = xMax - xMin + 2 * padX, rh = yMax - yMin + 2 * padY

  const tx = (v: number) => ((v - rx) / rw) * W
  const ty = (v: number) => H - ((v - ry) / rh) * H

  // Draw contour-like grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1
  for (let i = 0; i <= 10; i++) {
    const x = i / 10 * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    const y = i / 10 * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Draw heatmap-style fill based on z values
  const zs = path.map(p => p.z as number); const zMin = Math.min(...zs), zMax = Math.max(...zs)
  const zr = zMax - zMin || 1
  for (const pt of path) {
    const t = ((pt.z as number) - zMin) / zr
    const px = tx(pt.x as number), py = ty(pt.y as number)
    // blend: red (high) → blue (low)
    const r = Math.round(255 * t), b = Math.round(255 * (1 - t)), g = Math.round(128 * (1 - Math.abs(t - 0.5) * 2))
    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill()
  }

  // Draw path line up to current frame
  const animPath = store.currentPath
  if (animPath.length > 1) {
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.8)'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(tx(animPath[0].x as number), ty(animPath[0].y as number))
    for (let i = 1; i < animPath.length; i++) ctx.lineTo(tx(animPath[i].x as number), ty(animPath[i].y as number))
    ctx.stroke()
  }

  // Start point
  ctx.fillStyle = '#4fc3f7'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(tx(path[0].x as number), ty(path[0].y as number), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  // Current point
  const cur = store.currentPoint
  if (cur) {
    ctx.fillStyle = '#66bb6a'
    ctx.beginPath(); ctx.arc(tx(cur.x as number), ty(cur.y as number), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }

  // Final point
  const last = path[path.length - 1]
  ctx.fillStyle = '#ef5350'
  ctx.beginPath(); ctx.arc(tx(last.x as number), ty(last.y as number), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  // Best step within current chart range
  const best = store.bestInRange
  if (best) {
    ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(tx(best.x as number), ty(best.y as number), 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#f5a623'
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'
    ctx.fillText('★', tx(best.x as number), ty(best.y as number) - 12)
    ctx.textAlign = 'start'
  }

  // Labels
  ctx.fillStyle = '#aaa'; ctx.font = '11px system-ui'
  if (cur) {
    ctx.fillText(`步: ${cur.step}`, 10, 20)
    ctx.fillText(`x: ${(cur.x as number).toFixed(3)}`, 10, 36)
    ctx.fillText(`y: ${(cur.y as number).toFixed(3)}`, 10, 52)
    ctx.fillText(`f: ${(cur.z as number).toExponential(3)}`, 10, 68)
  }
}

onMounted(draw)
watch(() => [store.result, store.animationStep, store.rangeStart, store.rangeEnd], draw, { deep: true })
</script>

<style scoped>
.panel { background:#fff; border-radius:8px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,.06) }
.panel h3 { margin-bottom:8px; color:#333; font-size:14px }
.contour-canvas { display:block; margin:0 auto; border-radius:8px; border:1px solid #eee }
.info { text-align:center; margin-top:8px; font-size:12px; color:#888 }
</style>
