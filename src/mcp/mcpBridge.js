/**
 * MCP Bridge — Antigravity ↔ MCPAgent İletişim Katmanı
 *
 * Bu modül, MCPAgent CLI ile Antigravity arasında MCP protokolü
 * üzerinden iletişim kurar. Görev yürütme isteklerini Antigravity'nin
 * kendi agent runtime'ına iletir.
 *
 * Mimarisi:
 * - MCPAgent CLI → MCP Bridge → MCP Server → Antigravity Agent
 * - Antigravity Agent seçili modeli (Claude, Gemini, GPT) kullanarak
 *   ilgili proje dizininde görev yürütür
 */

import { getActivePlannerId, getActiveExecutorId, getModelForTask } from '../models/modelConfig.js';
import { findModel } from '../models/modelRegistry.js';
import { PROJECT_CONTEXT } from '../prompts/systemPrompts.js';

/**
 * Antigravity agent runtime'ı için görev context'i oluşturur
 *
 * Bu fonksiyon, MCP Server tarafından Antigravity'ye iletilen
 * yapılandırılmış görev paketini hazırlar.
 *
 * @param {object} task - Görev bilgisi (plan'dan)
 * @param {object} projectConfig - Proje konfigürasyonu
 * @param {string} [modelOverride] - Görev için özel model ID
 * @returns {Promise<object>} Antigravity-uyumlu görev context'i
 */
export async function buildAgentTaskContext(task, projectConfig, modelOverride) {
  const modelId = modelOverride || await getModelForTask(task.id);
  const model = await findModel(modelId);
  const context = PROJECT_CONTEXT[task.project] || '';

  return {
    // Görev meta
    taskId: task.id,
    project: task.project,
    priority: task.priority,
    dependencies: task.dependencies || [],

    // Proje bilgileri
    projectPath: projectConfig.path,
    projectType: projectConfig.type,
    projectContext: context,

    // Görev içeriği
    description: task.description,
    action: task.action || 'modify',

    // Model bilgileri
    model: {
      id: modelId,
      name: model?.name || modelId,
      provider: model?.provider || 'unknown',
      tier: model?.tier || 'unknown',
    },

    // Antigravity agent talimatları
    agentInstructions: buildAgentInstructions(task, projectConfig, context),
  };
}

/**
 * Antigravity agent'ına gönderilecek talimatları oluşturur
 * Bu talimatlar, Antigravity'nin agent runtime'ında çalıştırılır.
 *
 * @param {object} task
 * @param {object} projectConfig
 * @param {string} context
 * @returns {string}
 */
function buildAgentInstructions(task, projectConfig, context) {
  return `## Proje Bağlamı
${context}

## Proje Bilgileri
- Proje: ${task.project}
- Yol: ${projectConfig.path}
- Teknoloji: ${projectConfig.type}

## Görev
${task.description}

## Çalışma Kuralları
- Değişiklik yapacağın dosyaları belirt
- Mevcut kodu bozmadan çalış
- Hata olasılığı varsa açıkla
- Yapılan değişiklikleri özetle`;
}

/**
 * MCP üzerinden planner bağlamını hazırlar
 * Antigravity planner olarak kullanıldığında bu context gönderilir
 *
 * @param {string} userPrompt
 * @param {object} projects
 * @param {string[]} suggestedProjects
 * @returns {Promise<object>}
 */
export async function buildPlannerContext(userPrompt, projects, suggestedProjects) {
  const modelId = await getActivePlannerId();
  const model = await findModel(modelId);

  return {
    prompt: userPrompt,
    suggestedProjects,
    allProjects: Object.entries(projects).map(([key, cfg]) => ({
      key,
      path: cfg.path,
      type: cfg.type,
      context: PROJECT_CONTEXT[key] || '',
    })),
    model: {
      id: modelId,
      name: model?.name || modelId,
      provider: model?.provider || 'unknown',
    },
  };
}

/**
 * Görev sonucunu MCP uyumlu formata dönüştürür
 *
 * @param {object} result - Ham görev sonucu
 * @param {object} taskContext - buildAgentTaskContext çıktısı
 * @returns {object}
 */
export function formatTaskResult(result, taskContext) {
  return {
    taskId: taskContext.taskId,
    project: taskContext.project,
    model: taskContext.model,
    success: result.success,
    exitCode: result.exitCode,
    output: result.output,
    error: result.error,
    duration: result.duration,
    metadata: {
      projectPath: taskContext.projectPath,
      projectType: taskContext.projectType,
      action: taskContext.action,
    },
  };
}

/**
 * MCP üzerinden model listesini döner
 * MCP Server tool'larına ek olarak model bilgisi sağlar
 *
 * @returns {Promise<object>}
 */
export async function getModelInfoForMCP() {
  const plannerId = await getActivePlannerId();
  const executorId = await getActiveExecutorId();
  const planner = await findModel(plannerId);
  const executor = await findModel(executorId);

  return {
    planner: {
      id: plannerId,
      name: planner?.name || plannerId,
      provider: planner?.provider || 'unknown',
    },
    executor: {
      id: executorId,
      name: executor?.name || executorId,
      provider: executor?.provider || 'unknown',
    },
  };
}
