import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import axios from 'axios'
import type { OptimizationParams, OptimizationResult, StepRange } from '@/types'

const STORAGE_KEY = 'optviz-view-v1'

interface PersistedView {
  result: OptimizationResult | null
  params: OptimizationParams | null
  animationStep: number
  viewRange: StepRange | null
}

function loadPersisted(): PersistedView | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export const useOptimizationStore = defineStore('optimization', () => {
  const persisted = loadPersisted()

  const loading = ref(false)
  const result = ref<OptimizationResult | null>(persisted?.result ?? null)
  const animationStep = ref(0)
  const isPlaying = ref(false)
  const viewRange = ref<StepRange | null>(null)
  const viewMessage = ref('')
  const lastParams = ref<OptimizationParams | null>(persisted?.params ?? null)
  let playTimer: ReturnType<typeof setInterval> | null = null

  const totalSteps = () => (result.value ? result.value.path.length - 1 : 0)

  // 刷新后按上次口径恢复：定位位置与区间需通过和恢复结果的一致性校验
  if (persisted && result.value) {
    const max = totalSteps()
    const step = Math.floor(Number(persisted.animationStep))
    if (Number.isFinite(step)) animationStep.value = Math.min(Math.max(0, step), max)
    const r = persisted.viewRange
    if (Array.isArray(r) && r.length === 2 && r.every(n => Number.isInteger(n))
        && r[0] <= r[1] && r[0] >= 0 && r[1] <= max) {
      viewRange.value = [r[0], r[1]]
    }
  }

  // 持久化：播放中步数高频变化，统一做节流写入
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  function persist() {
    try {
      const state: PersistedView = {
        result: result.value,
        params: lastParams.value,
        animationStep: animationStep.value,
        viewRange: viewRange.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* 存储不可用时静默跳过 */ }
  }
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persist, 300)
  }
  watch([result, viewRange, lastParams, animationStep], schedulePersist, { deep: true })

  async function runOptimization(params: OptimizationParams) {
    loading.value = true
    stopAnimation()
    try {
      const { data } = await axios.post<OptimizationResult>('/api/optimize', params)
      result.value = data
      lastParams.value = params
      animationStep.value = 0
      viewMessage.value = ''
      // 上次的区间对新结果仍适用则保留，否则回到全程视图
      const max = data.path.length - 1
      if (viewRange.value && viewRange.value[1] > max) viewRange.value = null
    } finally { loading.value = false }
  }

  const currentPath = () => {
    if (!result.value) return []
    return result.value.path.slice(0, animationStep.value + 1)
  }

  function playAnimation() {
    if (!result.value) return
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (animationStep.value < (result.value?.path.length || 0) - 1) {
        animationStep.value++
      } else {
        stopAnimation()
      }
    }, 80)
  }

  function pauseAnimation() { stopAnimation() }
  function stopAnimation() {
    isPlaying.value = false
    if (playTimer) { clearInterval(playTimer); playTimer = null }
  }

  function resetAnimation() { stopAnimation(); animationStep.value = 0 }
  function setStep(step: number) { animationStep.value = step }

  /** 设置收敛曲线的步数区间；非法输入只给出说明，不改变当前画面 */
  function setViewRange(start: number, end: number): boolean {
    if (!result.value) {
      viewMessage.value = '还没有优化结果，请先运行一次优化再设置区间'
      return false
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      viewMessage.value = '请输入完整的整数步数作为区间起点和终点'
      return false
    }
    if (start > end) {
      viewMessage.value = `区间填反了：起点 ${start} 大于终点 ${end}，请调换后重试`
      return false
    }
    const max = totalSteps()
    if (start < 0 || end > max) {
      viewMessage.value = `区间超出范围：本次共 ${max} 步，可设置 0 ~ ${max} 之间的区间`
      return false
    }
    viewRange.value = [start, end]
    viewMessage.value = ''
    return true
  }

  function clearViewRange() {
    viewRange.value = null
    viewMessage.value = ''
  }

  /** 按步数定位到对应帧，收敛曲线与 2D/3D 画面同步跳转 */
  function locateStep(step: number): boolean {
    if (!result.value) {
      viewMessage.value = '还没有优化结果，无法按步数定位'
      return false
    }
    const max = totalSteps()
    if (!Number.isInteger(step) || step < 0 || step > max) {
      viewMessage.value = `步数超出范围：本次已计算 0 ~ ${max} 步，未计算的步数无法定位`
      return false
    }
    stopAnimation()
    animationStep.value = step
    viewMessage.value = ''
    return true
  }

  return {
    loading, result, animationStep, isPlaying, currentPath,
    viewRange, viewMessage, lastParams,
    runOptimization, playAnimation, pauseAnimation, stopAnimation, resetAnimation, setStep,
    setViewRange, clearViewRange, locateStep
  }
})
