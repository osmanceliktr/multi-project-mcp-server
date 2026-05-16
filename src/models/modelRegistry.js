/**
 * Model Registry — Dinamik Model Keşif & Yönetim
 *
 * Antigravity üzerinden erişilebilen modelleri yönetir.
 * Hardcoded model listeleri yerine config dosyasından okur.
 * Canlı model bilgileri Antigravity MCP endpoint'inden alınabilir.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, '..', '..', 'models.config.json');

/** @type {{ models: object[], active: object, settings: object } | null} */
let _cache = null;

/**
 * Model config dosyasını yükler veya cache'ten döner
 * @param {boolean} [forceRefresh=false] - Cache'i atla
 * @returns {Promise<object>} Model konfigürasyonu
 */
export async function loadModelConfig(forceRefresh = false) {
  if (_cache && !forceRefresh) return _cache;

  if (!existsSync(CONFIG_FILE)) {
    _cache = getDefaultConfig();
    await saveModelConfig(_cache);
    return _cache;
  }

  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    _cache = JSON.parse(raw);
    return _cache;
  } catch {
    _cache = getDefaultConfig();
    return _cache;
  }
}

/**
 * Model config dosyasını günceller
 * @param {object} config - Yeni config
 */
export async function saveModelConfig(config) {
  _cache = config;
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Tüm kullanılabilir modelleri döner
 * @returns {Promise<object[]>} Model listesi
 */
export async function getAvailableModels() {
  const config = await loadModelConfig();
  return config.models || [];
}

/**
 * Provider'a göre modelleri gruplar
 * @returns {Promise<Record<string, object[]>>} Provider → modeller
 */
export async function getModelsByProvider() {
  const models = await getAvailableModels();
  const grouped = {};

  for (const model of models) {
    const provider = model.provider || 'unknown';
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(model);
  }

  return grouped;
}

/**
 * Belirli bir model ID'sini arar
 * @param {string} modelId - Model ID
 * @returns {Promise<object|null>} Model bilgisi veya null
 */
export async function findModel(modelId) {
  const models = await getAvailableModels();
  return models.find(m => m.id === modelId) || null;
}

/**
 * Model listesine yeni model ekler veya mevcudu günceller
 * @param {object} model - Model bilgisi
 * @returns {Promise<{ action: 'added'|'updated', model: object }>}
 */
export async function registerModel(model) {
  const config = await loadModelConfig();
  const exists = config.models.findIndex(m => m.id === model.id);

  if (exists >= 0) {
    config.models[exists] = { ...config.models[exists], ...model };
    await saveModelConfig(config);
    return { action: 'updated', model: config.models[exists] };
  } else {
    config.models.push(model);
    await saveModelConfig(config);
    return { action: 'added', model };
  }
}

/**
 * Model listesinden bir modeli kaldırır
 * Aktif model silinmeye çalışılırsa uyarı döner
 * @param {string} modelId - Silinecek model ID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function removeModel(modelId) {
  const config = await loadModelConfig();
  const index = config.models.findIndex(m => m.id === modelId);

  if (index === -1) {
    return { success: false, message: `Model bulunamadı: ${modelId}` };
  }

  // Aktif model kontrolü
  if (config.active?.planner === modelId || config.active?.executor === modelId) {
    const roles = [];
    if (config.active.planner === modelId) roles.push('planner');
    if (config.active.executor === modelId) roles.push('executor');
    return {
      success: false,
      message: `Bu model aktif olarak kullanılıyor (${roles.join(', ')}). Önce başka bir model seçin.`,
    };
  }

  const removed = config.models.splice(index, 1)[0];
  await saveModelConfig(config);
  return { success: true, message: `Model kaldırıldı: ${removed.name}` };
}

/**
 * Model ID'sini insan dostu isimden otomatik oluşturur
 * Örn: "Gemini 3.1 Pro (High)" → "gemini-3.1-pro-high"
 * @param {string} name - Model adı
 * @returns {string} Slug ID
 */
export function generateModelId(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Bilinen provider'ları döner (kayıtlı modellerdeki unique provider'lar)
 * @returns {Promise<string[]>}
 */
export async function getKnownProviders() {
  const models = await getAvailableModels();
  return [...new Set(models.map(m => m.provider).filter(Boolean))];
}

/**
 * Aktif model bilgilerini döner
 * @returns {Promise<{ planner: object|null, executor: object|null }>}
 */
export async function getActiveModels() {
  const config = await loadModelConfig();
  const plannerId = config.active?.planner;
  const executorId = config.active?.executor;

  return {
    planner: plannerId ? await findModel(plannerId) : null,
    executor: executorId ? await findModel(executorId) : null,
    plannerRaw: plannerId,
    executorRaw: executorId,
  };
}

/**
 * Aktif modeli günceller
 * @param {'planner'|'executor'} role - Rol
 * @param {string} modelId - Model ID
 * @returns {Promise<boolean>} Başarılı mı
 */
export async function setActiveModel(role, modelId) {
  const model = await findModel(modelId);
  if (!model) return false;

  const config = await loadModelConfig();
  if (!config.active) config.active = {};
  config.active[role] = modelId;

  await saveModelConfig(config);
  return true;
}

/**
 * Varsayılan config (ilk çalıştırmada veya dosya yoksa)
 */
function getDefaultConfig() {
  return {
    models: [
      {
        id: 'gemini-3.1-pro-high',
        name: 'Gemini 3.1 Pro (High)',
        provider: 'google',
        tier: 'high',
        capabilities: ['code', 'analysis', 'planning', 'thinking'],
        speed: 'slow',
        quality: 'highest',
        recommended_for: ['planner', 'executor'],
      },
      {
        id: 'gemini-3.1-pro-low',
        name: 'Gemini 3.1 Pro (Low)',
        provider: 'google',
        tier: 'low',
        capabilities: ['code', 'analysis'],
        speed: 'medium',
        quality: 'high',
        recommended_for: ['executor'],
      },
      {
        id: 'gemini-3-flash',
        name: 'Gemini 3 Flash',
        provider: 'google',
        tier: 'fast',
        capabilities: ['code', 'analysis'],
        speed: 'fast',
        quality: 'medium',
        recommended_for: ['planner', 'executor'],
      },
      {
        id: 'claude-sonnet-4.6-thinking',
        name: 'Claude Sonnet 4.6 (Thinking)',
        provider: 'anthropic',
        tier: 'thinking',
        capabilities: ['code', 'analysis', 'planning', 'thinking', 'reasoning'],
        speed: 'medium',
        quality: 'high',
        recommended_for: ['planner', 'executor'],
      },
      {
        id: 'claude-opus-4.6-thinking',
        name: 'Claude Opus 4.6 (Thinking)',
        provider: 'anthropic',
        tier: 'thinking-max',
        capabilities: ['code', 'analysis', 'planning', 'thinking', 'reasoning', 'complex'],
        speed: 'slow',
        quality: 'highest',
        recommended_for: ['planner', 'executor'],
      },
      {
        id: 'gpt-oss-120b-medium',
        name: 'GPT-OSS 120B (Medium)',
        provider: 'openai-oss',
        tier: 'medium',
        capabilities: ['code', 'analysis'],
        speed: 'medium',
        quality: 'high',
        recommended_for: ['executor'],
      },
    ],
    active: {
      planner: 'gemini-3-flash',
      executor: 'claude-opus-4.6-thinking',
    },
    settings: {
      auto_refresh: true,
      fallback_to_gemini_cli: true,
      log_model_usage: true,
    },
  };
}
