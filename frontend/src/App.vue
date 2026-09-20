<template>
  <div class="app-container">
    <header class="app-header">
      <h1>📐 数值优化算法逐帧可视化教学平台</h1>
      <p class="subtitle">梯度下降 · 牛顿法 · 共轭梯度 · 模拟退火 | 2D等高线 + 3D曲面</p>
    </header>
    <main class="app-main">
      <ControlPanel />
      <div v-if="store.loading" class="loading-hint">⏳ 正在计算迭代路径…</div>
      <div class="vis-grid" v-else-if="store.result">
        <div class="vis-item"><ContourPlot /></div>
        <div class="vis-item"><Surface3D /></div>
      </div>
      <ConvergenceChart v-if="store.result && !store.loading" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import ControlPanel from './components/ControlPanel.vue'
import ContourPlot from './components/ContourPlot.vue'
import Surface3D from './components/Surface3D.vue'
import ConvergenceChart from './components/ConvergenceChart.vue'
import { useOptimizationStore } from './store/optimization'
const store = useOptimizationStore()

onMounted(async () => {
  // 刷新后按上次口径恢复：重跑上次参数，区间与定位帧随结果一起还原
  await store.restoreSession()
})
</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#f5f6fa}
.app-container{min-height:100vh}
.app-header{background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);color:#fff;padding:20px 40px}
.app-header h1{font-size:1.6rem}
.subtitle{opacity:.8;margin-top:4px;font-size:.85rem}
.app-main{padding:16px 40px}
.vis-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.loading-hint{margin-top:24px;text-align:center;color:#888;font-size:14px}
</style>
