<template>
  <div class="control-card">
    <el-form :model="form" inline>
      <el-form-item label="测试函数">
        <el-select v-model="form.functionId" style="width:180px">
          <el-option v-for="f in TEST_FUNCTIONS" :key="f.id" :label="f.name" :value="f.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="算法">
        <el-select v-model="form.algorithm" style="width:150px">
          <el-option v-for="a in ALGORITHMS" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="初始X">
        <el-input-number v-model="form.x0" :min="-10" :max="10" :step="0.5" size="small" />
      </el-form-item>
      <el-form-item label="初始Y">
        <el-input-number v-model="form.y0" :min="-10" :max="10" :step="0.5" size="small" />
      </el-form-item>
      <el-form-item label="学习率">
        <el-input-number v-model="form.learningRate" :min="0.001" :max="1" :step="0.01" :precision="3" size="small" />
      </el-form-item>
      <el-form-item label="迭代">
        <el-input-number v-model="form.iterations" :min="10" :max="500" :step="10" size="small" />
      </el-form-item>
      <el-form-item label="动量" v-if="form.algorithm==='gradient_descent'">
        <el-input-number v-model="form.momentum" :min="0" :max="0.99" :step="0.1" :precision="1" size="small" />
      </el-form-item>
      <el-form-item label="温度" v-if="form.algorithm==='simulated_annealing'">
        <el-input-number v-model="form.temperature" :min="1" :max="1000" :step="10" size="small" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="run" :loading="store.loading">🚀 开始优化</el-button>
      </el-form-item>
    </el-form>

    <div class="animation-bar" v-if="store.result">
      <div class="anim-controls">
        <el-button size="small" @click="store.playAnimation" :disabled="store.isPlaying">▶ 播放</el-button>
        <el-button size="small" @click="store.pauseAnimation" :disabled="!store.isPlaying">⏸ 暂停</el-button>
        <el-button size="small" @click="store.resetAnimation">⏹ 重置</el-button>
      </div>
      <el-slider :model-value="store.animationStep" :min="0" :max="store.maxStep"
        @input="onSlider" style="flex:1;margin:0 20px" />
      <span class="step-text">步 {{ store.animationStep }}/{{ store.maxStep }}</span>
      <div class="locate-box">
        <span class="locate-label">定位到步</span>
        <el-input-number v-model="locateInput" :step="1" size="small" controls-position="right"
          class="locate-input" :placeholder="`0-${store.maxStep}`" @keyup.enter="onLocate" />
        <el-button size="small" type="primary" plain @click="onLocate">🎯 定位</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useOptimizationStore } from '../store/optimization'
import { TEST_FUNCTIONS, ALGORITHMS, type OptimizationParams } from '../types'
const store = useOptimizationStore()

const defaults: OptimizationParams = {
  algorithm: 'gradient_descent', functionId: 'rosenbrock',
  x0: -1.5, y0: 2.5, learningRate: 0.01, iterations: 100,
  momentum: 0.9, temperature: 100, coolingRate: 0.95
}
// 刷新后表单按上次的口径回填
const saved = store.getSavedParams()
const form = reactive<OptimizationParams>({ ...defaults, ...(saved || {}) })

const locateInput = ref<number | null>(null)

function run() { store.runOptimization({ ...form } as OptimizationParams) }
function onSlider(v: number | number[]) { store.setStep(Array.isArray(v) ? v[0] : v) }
function onLocate() {
  if (locateInput.value === null || locateInput.value === undefined) {
    store.locateStep(NaN)
    return
  }
  store.locateStep(locateInput.value)
}
</script>

<style scoped>
.control-card { background:#fff; border-radius:8px; padding:16px 20px; box-shadow:0 2px 8px rgba(0,0,0,.06); margin-bottom:16px }
.animation-bar { display:flex; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #eee; flex-wrap:wrap; gap:10px }
.anim-controls { display:flex; gap:6px }
.step-text { font-size:13px; color:#666; white-space:nowrap }
.locate-box { display:flex; align-items:center; gap:6px }
.locate-label { font-size:12px; color:#666; white-space:nowrap }
.locate-input { width:110px }
</style>
