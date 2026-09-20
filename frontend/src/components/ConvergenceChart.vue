<template>
  <div class="panel">
    <div class="panel-head">
      <h3>📉 收敛曲线</h3>
      <div class="range-bar">
        <span class="range-label">步数区间</span>
        <el-input-number v-model="inputStart" :step="1" size="small" controls-position="right"
          class="range-input" :placeholder="`0`" />
        <span class="range-sep">–</span>
        <el-input-number v-model="inputEnd" :step="1" size="small" controls-position="right"
          class="range-input" :placeholder="`${store.maxStep}`" />
        <el-button size="small" type="primary" plain @click="onApplyRange">应用区间</el-button>
        <el-button size="small" @click="onResetRange">重置</el-button>
        <el-button size="small" type="warning" plain @click="onLocateBest">⭐ 定位区间最优步</el-button>
      </div>
    </div>

    <div class="range-info">
      <template v-if="best">
        当前区间：步 {{ winStart }} – {{ winEnd }}，共 {{ seg.length }} 个已算出的步；
        🏆 段内最优为步 <b>{{ best.step }}</b>（f = {{ best.z!.toExponential(3) }}）
      </template>
      <template v-else>当前区间内还没有算出来的步</template>
      <span class="tip">（滚轮缩放 / 拖动下方滑块筛选，点击曲线可定位到该帧）</span>
    </div>

    <div ref="chart" class="chart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useOptimizationStore } from '../store/optimization'

const store = useOptimizationStore()
const chart = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let resizeHandler: (() => void) | null = null

// 输入框里的内容与已应用的区间分离：校验不过时输入仍在，画面保持原样
const inputStart = ref<number | null>(store.rangeStart)
const inputEnd = ref<number | null>(store.rangeEnd)

watch([() => store.rangeStart, () => store.rangeEnd], ([s, e]) => {
  inputStart.value = (s as number | null) ?? null
  inputEnd.value = (e as number | null) ?? null
})

const winStart = ref(0)
const winEnd = ref(0)
const seg = ref(store.rangedPath)
const best = ref(store.bestInRange)

function refreshDerived() {
  seg.value = store.rangedPath
  best.value = store.bestInRange
  winStart.value = store.currentRange[0]
  winEnd.value = store.currentRange[1]
}

function buildOption() {
  if (!instance || !store.result) return
  refreshDerived()
  const path = store.validPath
  if (!path.length) {
    instance.clear()
    return
  }
  const [ws, we] = store.currentRange
  const inWindow = path.filter(p => p.step >= ws && p.step <= we)
  const fullData = inWindow.map(p => [p.step, p.z])
  const playedData = inWindow
    .filter(p => p.step <= store.animationStep)
    .map(p => [p.step, p.z])

  const marks: Record<string, unknown>[] = []
  const b = store.bestInRange
  if (b) {
    marks.push({
      coord: [b.step, b.z as number], value: `最优 #${b.step}`,
      symbol: 'pin', symbolSize: 46,
      itemStyle: { color: '#f5a623' },
      label: { color: '#fff', fontSize: 10 }
    })
  }
  const cur = store.currentPoint
  if (cur && cur.step >= ws && cur.step <= we) {
    marks.push({
      coord: [cur.step, cur.z as number], value: `#${cur.step}`,
      symbol: 'diamond', symbolSize: 18, symbolRotate: 0,
      itemStyle: { color: '#43a047', borderColor: '#fff', borderWidth: 1 },
      label: { show: true, formatter: `当前 #${cur.step}`, position: 'bottom', color: '#2e7d32', fontSize: 10 }
    })
  }

  instance.setOption({
    backgroundColor: 'transparent',
    grid: { left: 64, right: 24, top: 24, bottom: 64 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => Number(v).toExponential(4),
      axisPointer: { type: 'cross' }
    },
    xAxis: {
      type: 'value', name: '迭代步数', nameLocation: 'middle', nameGap: 28,
      minInterval: 1, min: 0, max: store.maxStep, scale: true
    },
    yAxis: {
      type: 'value', name: 'f(x,y)', nameLocation: 'middle', nameGap: 48, scale: true
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'filter', startValue: ws, endValue: we },
      {
        type: 'slider', xAxisIndex: 0, filterMode: 'filter',
        startValue: ws, endValue: we, minValueSpan: 1, height: 18, bottom: 26
      }
    ],
    series: [
      {
        name: '区间', type: 'line', data: fullData, symbol: 'none', smooth: false,
        lineStyle: { color: '#b7c2d4', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#b7c2d4' }, z: 1
      },
      {
        name: '已播放', type: 'line', data: playedData, symbol: 'none', smooth: false,
        lineStyle: { color: '#667eea', width: 2.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(102,126,234,0.3)' }, { offset: 1, color: 'rgba(102,126,234,0)' }
        ]) },
        markPoint: { data: marks, animation: false },
        z: 2
      }
    ],
    animation: false
  }, { replaceMerge: ['series'] })
}

// 播放推进：只更新数据与标记点，不动 dataZoom，避免用户缩放被打断
function updatePlayback() {
  if (!instance || !store.result) return
  refreshDerived()
  const [ws, we] = store.currentRange
  const inWindow = store.validPath.filter(p => p.step >= ws && p.step <= we)
  const playedData = inWindow.filter(p => p.step <= store.animationStep).map(p => [p.step, p.z])

  const marks: Record<string, unknown>[] = []
  const b = store.bestInRange
  if (b) {
    marks.push({
      coord: [b.step, b.z as number], value: `最优 #${b.step}`,
      symbol: 'pin', symbolSize: 46,
      itemStyle: { color: '#f5a623' },
      label: { color: '#fff', fontSize: 10 }
    })
  }
  const cur = store.currentPoint
  if (cur && cur.step >= ws && cur.step <= we) {
    marks.push({
      coord: [cur.step, cur.z as number], value: `#${cur.step}`,
      symbol: 'diamond', symbolSize: 18,
      itemStyle: { color: '#43a047', borderColor: '#fff', borderWidth: 1 },
      label: { show: true, formatter: `当前 #${cur.step}`, position: 'bottom', color: '#2e7d32', fontSize: 10 }
    })
  }
  instance.setOption({ series: [{ data: inWindow.map(p => [p.step, p.z]) }, { data: playedData, markPoint: { data: marks } }] })
}

function onDataZoom() {
  if (!instance) return
  // 用户拖动滑块/滚轮：把窗口同步回 store
  const opt = instance.getOption() as {
    dataZoom?: { startValue?: number; endValue?: number; start?: number; end?: number }[]
  }
  const dz = opt.dataZoom?.[0]
  if (!dz) return
  let s: number, e: number
  if (dz.startValue !== undefined && dz.endValue !== undefined) {
    s = Math.round(dz.startValue); e = Math.round(dz.endValue)
  } else if (dz.start !== undefined && dz.end !== undefined) {
    s = Math.round(dz.start / 100 * store.maxStep)
    e = Math.round(dz.end / 100 * store.maxStep)
  } else {
    return
  }
  s = Math.max(0, Math.min(s, store.maxStep))
  e = Math.max(0, Math.min(e, store.maxStep))
  if (s > e) [s, e] = [e, s]
  store.applyRange(s, e, { silent: true })
}

function onChartClick(params: { componentType?: string; value?: unknown }) {
  if (params.componentType !== 'series') return
  const v = params.value
  if (Array.isArray(v) && Number.isFinite(v[0])) store.locateStep(v[0])
}

function onApplyRange() {
  if (store.applyRange(inputStart.value, inputEnd.value)) buildOption()
}
function onResetRange() {
  store.resetRange()
  buildOption()
}
function onLocateBest() {
  if (store.locateBest()) buildOption()
}

onMounted(() => {
  if (!chart.value) return
  instance = echarts.init(chart.value)
  buildOption()
  resizeHandler = () => instance?.resize()
  window.addEventListener('resize', resizeHandler)
  instance.on('dataZoom', onDataZoom)
  instance.on('click', onChartClick)
})

watch(() => store.result, () => { buildOption() })
watch(() => [store.rangeStart, store.rangeEnd], () => { buildOption() })
watch(() => store.animationStep, () => { updatePlayback() })

onUnmounted(() => {
  instance?.off('dataZoom', onDataZoom)
  instance?.off('click', onChartClick)
  instance?.dispose()
  instance = null
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
})
</script>

<style scoped>
.panel { background:#fff; border-radius:8px; padding:16px; margin-top:16px; box-shadow:0 2px 8px rgba(0,0,0,.06) }
.panel-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px }
.panel h3 { color:#333; font-size:14px }
.range-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap }
.range-label { font-size:12px; color:#666 }
.range-input { width:104px }
.range-sep { color:#999 }
.range-info { margin:8px 0 4px; font-size:12px; color:#555 }
.range-info b { color:#d97706 }
.range-info .tip { color:#aaa; margin-left:6px }
.chart { width:100%; height:340px }
</style>
