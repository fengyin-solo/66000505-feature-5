<template>
  <div class="panel">
    <div class="chart-head">
      <h3>📉 收敛曲线</h3>
      <div class="toolbar">
        <span class="tool-group">
          <span class="tool-label">步数区间</span>
          <el-input-number v-model="rangeStart" :min="0" :max="totalSteps" :controls="false"
                           size="small" class="num-input" placeholder="起" />
          <span class="tilde">~</span>
          <el-input-number v-model="rangeEnd" :min="0" :max="totalSteps" :controls="false"
                           size="small" class="num-input" placeholder="终" />
          <el-button size="small" type="primary" @click="applyRange">应用区间</el-button>
          <el-button size="small" :disabled="!store.viewRange" @click="resetRange">全程</el-button>
        </span>
        <span class="tool-group">
          <span class="tool-label">步数定位</span>
          <el-input-number v-model="queryStep" :min="0" :max="totalSteps" :controls="false"
                           size="small" class="num-input" placeholder="步" />
          <el-button size="small" type="primary" @click="locate">定位</el-button>
        </span>
      </div>
    </div>
    <div v-if="store.viewMessage" class="view-msg">⚠️ {{ store.viewMessage }}</div>
    <div v-if="bestInSegment" class="best-line">
      🏅 {{ store.viewRange ? '当前区间' : '全程' }}最优：第 {{ bestInSegment.step }} 步，
      f = {{ fmt(bestInSegment.z) }}（x={{ bestInSegment.x.toFixed(3) }}, y={{ bestInSegment.y.toFixed(3) }}）
      <el-button size="small" link type="primary" @click="locateBest">定位到该步</el-button>
    </div>
    <div ref="chart" class="chart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useOptimizationStore } from '../store/optimization'
import type { IterationPoint } from '../types'

const store = useOptimizationStore()
const chart = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null

const totalSteps = computed(() => (store.result ? store.result.path.length - 1 : 0))
const activeRange = computed<[number, number]>(() => store.viewRange ?? [0, totalSteps.value])

const rangeStart = ref<number | undefined>(store.viewRange?.[0] ?? 0)
const rangeEnd = ref<number | undefined>(store.viewRange?.[1] ?? totalSteps.value)
const queryStep = ref<number | undefined>(store.animationStep)

// 区间被重置或从上次状态恢复时，同步输入框显示
watch(() => store.viewRange, (r) => {
  rangeStart.value = r?.[0] ?? 0
  rangeEnd.value = r?.[1] ?? totalSteps.value
})
// 新结果出来且未设区间时，终点输入框跟随新的总步数
watch(totalSteps, (max) => { if (!store.viewRange) rangeEnd.value = max })

// 当前区间内的最优步（按全部已算出的数据取最小 f）
const bestInSegment = computed<IterationPoint | null>(() => {
  if (!store.result) return null
  const [rs, re] = activeRange.value
  let best: IterationPoint | null = null
  for (const p of store.result.path) {
    if (p.step < rs || p.step > re) continue
    if (!best || p.z < best.z) best = p
  }
  return best
})

function applyRange() {
  store.setViewRange(rangeStart.value as number, rangeEnd.value as number)
}
function resetRange() { store.clearViewRange() }
function locate() { store.locateStep(queryStep.value as number) }
function locateBest() { if (bestInSegment.value) store.locateStep(bestInSegment.value.step) }

function fmt(v: number): string {
  if (v !== 0 && (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3)) return v.toExponential(3)
  return v.toFixed(4)
}

function onResize() { instance?.resize() }

function initChart() {
  if (!chart.value) return
  instance = echarts.init(chart.value)
  window.addEventListener('resize', onResize)
}

function updateChart() {
  if (!instance || !store.result) return
  const [rs, re] = activeRange.value
  const cur = store.animationStep
  // 只画区间内、且已经计算（播放）到的步，未算出的步跳过不画
  const data = store.result.path
    .filter(p => p.step >= rs && p.step <= re && p.step <= cur)
    .map(p => [p.step, p.z])
  const best = bestInSegment.value
  instance.setOption({
    backgroundColor: 'transparent',
    grid: { left: 60, right: 30, top: 30, bottom: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'value', name: '迭代步数', nameLocation: 'middle', nameGap: 25,
      min: rs, max: re === rs ? rs + 1 : re
    },
    yAxis: { type: 'value', name: 'f(x,y)', nameLocation: 'middle', nameGap: 45, scale: true },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#667eea', width: 2 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(102,126,234,0.3)' }, { offset: 1, color: 'rgba(102,126,234,0)' }
      ]) },
      markPoint: {
        symbol: 'pin', symbolSize: 44,
        itemStyle: { color: '#f56c6c' },
        label: { color: '#fff', fontSize: 11, formatter: (p: any) => `${p.data.coord[0]}` },
        data: best ? [{ coord: [best.step, best.z] }] : []
      },
      markLine: {
        symbol: 'none', animation: false,
        lineStyle: { color: '#67c23a', type: 'dashed', width: 1.5 },
        label: { formatter: `第 ${cur} 步`, position: 'insideEndTop', color: '#67c23a' },
        data: cur >= rs && cur <= re ? [{ xAxis: cur }] : []
      }
    }],
    animation: false
  })
}

onMounted(() => { initChart(); updateChart() })
watch(() => [store.result, store.animationStep, store.viewRange], updateChart, { deep: true })
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  instance?.dispose(); instance = null
})
</script>

<style scoped>
.panel { background:#fff; border-radius:8px; padding:16px; margin-top:16px; box-shadow:0 2px 8px rgba(0,0,0,.06) }
.chart-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px }
.chart-head h3 { color:#333; font-size:14px }
.toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:16px }
.tool-group { display:flex; align-items:center; gap:6px }
.tool-label { font-size:12px; color:#666; white-space:nowrap }
.num-input { width:72px }
.tilde { color:#999 }
.view-msg { margin-bottom:8px; padding:6px 10px; border-radius:4px; background:#fef0f0; color:#f56c6c; font-size:12px }
.best-line { margin-bottom:8px; font-size:12px; color:#666 }
.chart { width:100%; height:280px }
</style>
