import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { OptimizationParams, OptimizationResult, IterationPoint } from '@/types'

const STORAGE_KEY = 'optimization-view-session-v1'

interface StoredSession {
  params?: OptimizationParams
  rangeStart?: number
  rangeEnd?: number
  step?: number
}

function loadSession(): StoredSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function isUsablePoint(p: IterationPoint | undefined | null): p is IterationPoint {
  return !!p && Number.isFinite(p.step) && Number.isFinite(p.x) &&
    Number.isFinite(p.y) && Number.isFinite(p.z)
}

export const useOptimizationStore = defineStore('optimization', () => {
  const loading = ref(false)
  const result = ref<OptimizationResult | null>(null)
  const animationStep = ref(0)
  const isPlaying = ref(false)
  // 当前筛选区间（null 表示整条曲线）
  const rangeStart = ref<number | null>(null)
  const rangeEnd = ref<number | null>(null)
  const restoredFromSession = ref(false)
  let playTimer: ReturnType<typeof setInterval> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const maxStep = computed(() => {
    const path = result.value?.path
    if (!path || path.length === 0) return 0
    return Math.max(...path.map(p => p.step))
  })

  // 只保留真正算出来的步（null / NaN / Infinity 一律跳过）
  const validPath = computed<IterationPoint[]>(() =>
    (result.value?.path || []).filter(isUsablePoint)
  )

  // 当前已播放到的有效路径（用于 2D/3D 绘制轨迹）
  const currentPath = computed<IterationPoint[]>(() =>
    validPath.value.filter(p => p.step <= animationStep.value)
  )

  const currentPoint = computed<IterationPoint | null>(() => {
    const path = currentPath.value
    return path.length ? path[path.length - 1] : null
  })

  const currentRange = computed<[number, number]>(() => [
    rangeStart.value ?? 0,
    rangeEnd.value ?? maxStep.value
  ])

  // 区间内有效点
  const rangedPath = computed<IterationPoint[]>(() => {
    const [s, e] = currentRange.value
    return validPath.value.filter(p => p.step >= s && p.step <= e)
  })

  const bestInRange = computed<IterationPoint | null>(() => {
    const seg = rangedPath.value
    if (!seg.length) return null
    return seg.reduce((a, b) => (b.z as number) < (a.z as number) ? b : a)
  })

  // 合并（节流+尾触发）写入 localStorage，播放推进时不会频繁写盘
  function persist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(flushPersist, 250)
  }
  function flushPersist() {
    const session: StoredSession = {
      params: (result.value?.params || pendingParams.value) ?? undefined,
      rangeStart: rangeStart.value ?? undefined,
      rangeEnd: rangeEnd.value ?? undefined,
      step: animationStep.value
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { /* ignore */ }
  }

  function nearestValidStep(step: number): IterationPoint | null {
    const path = validPath.value
    if (!path.length) return null
    let best = path[0]
    for (const p of path) {
      if (Math.abs(p.step - step) < Math.abs(best.step - step)) best = p
    }
    return best
  }

  type RangeCheck =
    | { ok: true; start: number; end: number }
    | { ok: false; reason: string }

  // 校验区间：无结果、填反、超界都给出说明；不改动当前画面
  function checkRange(rawStart: number | null | undefined, rawEnd: number | null | undefined): RangeCheck {
    if (!result.value) return { ok: false, reason: '还没有优化结果，请先运行优化后再设置区间' }
    const total = maxStep.value
    if (rawStart === null || rawStart === undefined || rawEnd === null || rawEnd === undefined) {
      return { ok: true, start: 0, end: total }
    }
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      return { ok: false, reason: '区间起止步数需要是有效整数' }
    }
    if (rawStart > rawEnd) return { ok: false, reason: `区间填反了：起点 ${rawStart} 大于终点 ${rawEnd}，请交换后再应用` }
    if (rawStart < 0 || rawEnd > total) {
      return { ok: false, reason: `区间超出总步数，当前总步数为 0–${total}，请调整到该范围内` }
    }
    return { ok: true, start: rawStart, end: rawEnd }
  }

  function applyRange(rawStart: number | null, rawEnd: number | null, opts: { silent?: boolean } = {}): boolean {
    const check = checkRange(rawStart, rawEnd)
    if (!check.ok) {
      if (!opts.silent) ElMessage.warning(check.reason)
      return false
    }
    const full = check.start === 0 && check.end === maxStep.value
    rangeStart.value = full ? null : check.start
    rangeEnd.value = full ? null : check.end
    persist()
    return true
  }

  function resetRange() {
    rangeStart.value = null
    rangeEnd.value = null
    persist()
  }

  // 定位到指定步；无结果/无有效步给说明；未算出的步只跳过，定位到最近的有效步
  function locateStep(step: number, opts: { silent?: boolean } = {}): boolean {
    if (!result.value) {
      if (!opts.silent) ElMessage.warning('还没有优化结果，请先运行优化后再按步数定位')
      return false
    }
    if (!Number.isFinite(step)) {
      if (!opts.silent) ElMessage.warning('请输入要定位的步数')
      return false
    }
    // 超出总步数：给出说明并保持原来的画面
    if (step < 0 || step > maxStep.value) {
      if (!opts.silent) ElMessage.warning(`步 ${step} 超出总步数，当前总步数为 0–${maxStep.value}`)
      return false
    }
    const target = nearestValidStep(step)
    if (!target) {
      if (!opts.silent) ElMessage.warning('当前结果中还没有算出来的步，无法定位')
      return false
    }
    const [s, e] = currentRange.value
    if (target.step < s || target.step > e) {
      // 目标步在当前区间外：保持区间宽度平移窗口，把目标帧纳入视野
      const span = e - s
      let ns = target.step - Math.round(span / 2)
      ns = Math.max(0, Math.min(ns, maxStep.value - span))
      applyRange(ns, Math.min(maxStep.value, ns + span), { silent: true })
      if (!opts.silent) ElMessage.info(`步 ${step} 不在当前区间，画面已平移到包含步 ${target.step}`)
    } else if (target.step !== step && !opts.silent) {
      // 该步在序号范围内但未算出（数值发散）：只跳过，定位到最近的有效步
      ElMessage.info(`步 ${step} 尚未算出，已定位到最近的有效步 ${target.step}`)
    }
    stopAnimation()
    animationStep.value = target.step
    persist()
    return true
  }

  function locateBest(): boolean {
    const best = bestInRange.value
    if (!best) {
      ElMessage.warning('当前区间内没有已算出的步，无法标记最优步')
      return false
    }
    return locateStep(best.step, { silent: true })
  }

  function setStep(step: number) {
    if (!result.value) return
    const target = nearestValidStep(step)
    if (target) {
      stopAnimation()
      animationStep.value = target.step
      persist()
    }
  }

  function playAnimation() {
    if (!result.value || isPlaying.value) return
    const valid = validPath.value
    if (!valid.length) return
    const lastStep = valid[valid.length - 1].step
    if (animationStep.value >= lastStep) animationStep.value = valid[0].step
    isPlaying.value = true
    playTimer = setInterval(() => {
      // 未算出的步只跳过：找严格大于当前帧的第一个有效步
      const nxt = validPath.value.find(p => p.step > animationStep.value)
      if (nxt && nxt.step <= lastStep) {
        animationStep.value = nxt.step
        persist()
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

  function resetAnimation() { stopAnimation(); animationStep.value = 0; persist() }

  const pendingParams = ref<OptimizationParams | null>(null)

  async function runOptimization(params: OptimizationParams, isRestore = false) {
    loading.value = true
    stopAnimation()
    pendingParams.value = params
    if (!isRestore) {
      // 手动发起新的一轮：区间与定位恢复为初始口径
      rangeStart.value = null
      rangeEnd.value = null
    }
    try {
      const { data } = await axios.post('/api/optimize', params)
      result.value = data
      const total = maxStep.value
      if (isRestore) {
        const session = loadSession()
        const check = checkRange(session.rangeStart ?? null, session.rangeEnd ?? null)
        if (check.ok) {
          const full = check.start === 0 && check.end === total
          rangeStart.value = full ? null : check.start
          rangeEnd.value = full ? null : check.end
        } else {
          rangeStart.value = null
          rangeEnd.value = null
          ElMessage.info('上次保存的步数区间对本次结果已失效，已恢复为整条曲线')
        }
        const savedStep = typeof session.step === 'number' ? session.step : 0
        const target = nearestValidStep(savedStep) ?? validPath.value[0]
        animationStep.value = target ? target.step : 0
        restoredFromSession.value = true
      } else {
        animationStep.value = 0
      }
      persist()
    } finally {
      loading.value = false
    }
  }

  // 刷新后按上次口径恢复：重跑上次参数并恢复区间与定位帧
  async function restoreSession(): Promise<boolean> {
    const session = loadSession()
    if (!session.params) return false
    await runOptimization(session.params, true)
    return true
  }

  function getSavedParams(): OptimizationParams | null {
    return loadSession().params ?? null
  }

  return {
    loading, result, animationStep, isPlaying, restoredFromSession,
    rangeStart, rangeEnd, currentRange, maxStep,
    validPath, currentPath, currentPoint, rangedPath, bestInRange,
    runOptimization, restoreSession, getSavedParams,
    playAnimation, pauseAnimation, stopAnimation, resetAnimation, setStep,
    applyRange, resetRange, checkRange, locateStep, locateBest, nearestValidStep
  }
})
