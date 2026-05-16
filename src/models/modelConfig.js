/**
 * Model Config — Runtime Model State Yönetimi
 *
 * Aktif model bilgilerini tutar ve sorgular.
 * Hem planner hem executor için ayrı model seçimi destekler.
 * Per-task model override desteği.
 */

import { getActiveModels, setActiveModel, findModel, getAvailableModels } from './modelRegistry.js';

/** Runtime override'ları (per-session, config dosyasını etkilemez) */
let _sessionOverrides = {
  planner: null,
  executor: null,
};

/** Görev bazlı model override'ları */
const _taskOverrides = new Map();

/**
 * Aktif planner model ID'sini döner
 * Öncelik: session override → config dosyası → fallback
 * @returns {Promise<string>} Model ID
 */
export async function getActivePlannerId() {
  if (_sessionOverrides.planner) return _sessionOverrides.planner;

  const { plannerRaw } = await getActiveModels();
  return plannerRaw || 'gemini-3-flash';
}

/**
 * Aktif executor model ID'sini döner
 * @returns {Promise<string>} Model ID
 */
export async function getActiveExecutorId() {
  if (_sessionOverrides.executor) return _sessionOverrides.executor;

  const { executorRaw } = await getActiveModels();
  return executorRaw || 'claude-opus-4.6-thinking';
}

/**
 * Aktif planner model bilgisini döner (tam obje)
 * @returns {Promise<object|null>}
 */
export async function getActivePlannerModel() {
  const id = await getActivePlannerId();
  return await findModel(id);
}

/**
 * Aktif executor model bilgisini döner (tam obje)
 * @returns {Promise<object|null>}
 */
export async function getActiveExecutorModel() {
  const id = await getActiveExecutorId();
  return await findModel(id);
}

/**
 * Aktif modeli değiştirir (kalıcı — config dosyasına yazılır)
 * @param {'planner'|'executor'} role
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function switchModel(role, modelId) {
  const success = await setActiveModel(role, modelId);
  if (success) {
    // Session override'ı da güncelle
    _sessionOverrides[role] = modelId;
  }
  return success;
}

/**
 * Session-only model override (config dosyasını etkilemez)
 * @param {'planner'|'executor'} role
 * @param {string} modelId
 */
export async function setSessionOverride(role, modelId) {
  const model = await findModel(modelId);
  if (!model) return false;
  _sessionOverrides[role] = modelId;
  return true;
}

/**
 * Belirli bir görev için model override'ı ayarla
 * @param {string} taskId
 * @param {string} modelId
 */
export function setTaskModelOverride(taskId, modelId) {
  _taskOverrides.set(taskId, modelId);
}

/**
 * Görev için model ID'sini döner (override varsa onu, yoksa aktif executor)
 * @param {string} taskId
 * @returns {Promise<string>}
 */
export async function getModelForTask(taskId) {
  if (_taskOverrides.has(taskId)) {
    return _taskOverrides.get(taskId);
  }
  return await getActiveExecutorId();
}

/**
 * Görev override'ını temizle
 * @param {string} taskId
 */
export function clearTaskModelOverride(taskId) {
  _taskOverrides.delete(taskId);
}

/**
 * Tüm session override'larını temizle
 */
export function clearSessionOverrides() {
  _sessionOverrides = { planner: null, executor: null };
}

/**
 * Model kullanım özetini döner (log için)
 * @returns {Promise<object>}
 */
export async function getModelUsageSummary() {
  const plannerId = await getActivePlannerId();
  const executorId = await getActiveExecutorId();
  const plannerModel = await findModel(plannerId);
  const executorModel = await findModel(executorId);

  return {
    planner: {
      id: plannerId,
      name: plannerModel?.name || plannerId,
      provider: plannerModel?.provider || 'unknown',
    },
    executor: {
      id: executorId,
      name: executorModel?.name || executorId,
      provider: executorModel?.provider || 'unknown',
    },
    taskOverrides: Object.fromEntries(_taskOverrides),
  };
}
