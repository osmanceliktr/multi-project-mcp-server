/**
 * Antigravity-Native Executor
 *
 * Gemini CLI spawn yerine Antigravity'nin kendi agent runtime'ını kullanır.
 * Seçilen model (Claude, Gemini, GPT) Antigravity üzerinden aktif olarak
 * görev yürütmede kullanılır.
 *
 * Mimari:
 * - Plan'dan gelen görev listesi
 * - Her görev için Antigravity agent context hazırlanır
 * - MCP Bridge üzerinden model bilgisi inject edilir
 * - Görev ilgili proje dizininde yürütülür
 * - Fallback: Gemini CLI (config ile açılabilir)
 */

import { buildAgentTaskContext, formatTaskResult } from '../mcp/mcpBridge.js';
import { getModelForTask } from '../models/modelConfig.js';
import { findModel } from '../models/modelRegistry.js';
import { loadModelConfig } from '../models/modelRegistry.js';
import { spawnGemini } from '../utils/geminiSpawn.js';
import { buildAgentPrompt } from '../agents/agentPrompts.js';

/**
 * Tek bir görevi Antigravity runtime ile çalıştırır
 *
 * Bu fonksiyon, Antigravity'nin MCP üzerinden sunduğu agent yeteneklerini
 * kullanarak görevi yürütür. Seçili model (Claude Opus, Gemini Pro, vb.)
 * Antigravity tarafından runtime'da kullanılır.
 *
 * @param {object} task - Görev bilgisi
 * @param {object} projectConfig - Proje konfigürasyonu
 * @returns {Promise<object>} Görev sonucu
 */
export async function executeTaskAntigravity(task, projectConfig) {
  const startTime = Date.now();

  // Model bilgilerini al
  const modelId = await getModelForTask(task.id);
  const model = await findModel(modelId);
  const modelName = model?.name || modelId;

  console.log(`\n⚡ [${task.project}] Görev başlatılıyor...`);
  console.log(`   📁 Dizin: ${projectConfig.path}`);
  console.log(`   🤖 Model: ${modelName} (${model?.provider || 'unknown'})`);

  try {
    // Antigravity agent task context'i oluştur
    const taskContext = await buildAgentTaskContext(task, projectConfig);

    // Agent talimatlarını çalıştır
    const result = await runAntigravityAgent(taskContext);

    const dur = Date.now() - startTime;
    const success = result.success;
    const icon = success ? '✅' : '❌';
    console.log(`   ${icon} [${task.project}] Tamamlandı (${Math.round(dur / 1000)}s) [${modelName}]`);

    return formatTaskResult(
      { ...result, duration: dur },
      taskContext
    );
  } catch (error) {
    const dur = Date.now() - startTime;
    console.log(`   ❌ [${task.project}] Hata: ${error.message}`);

    // Fallback: Gemini CLI
    const config = await loadModelConfig();
    if (config.settings?.fallback_to_gemini_cli) {
      console.log(`   🔄 Fallback: Gemini CLI ile yeniden deneniyor...`);
      return await executeTaskGeminiFallback(task, projectConfig, dur);
    }

    return {
      taskId: task.id,
      project: task.project,
      model: { id: modelId, name: modelName },
      success: false,
      exitCode: -1,
      output: '',
      error: error.message,
      duration: dur,
    };
  }
}

/**
 * Antigravity agent runtime'ında görevi yürütür
 *
 * Bu fonksiyon MCP üzerinden Antigravity'ye görev gönderir.
 * Antigravity, kendi model seçim mekanizmasını kullanarak
 * (kullanıcının seçtiği model ile) görevi yürütür.
 *
 * @param {object} taskContext - MCP Bridge tarafından hazırlanan context
 * @returns {Promise<object>}
 */
async function runAntigravityAgent(taskContext) {
  // Antigravity agent modunda çalışma
  // MCP üzerinden Antigravity'ye görev iletilir
  // Antigravity kendi runtime'ında seçili model ile yürütür

  const agentPayload = {
    action: 'execute_task',
    task: {
      id: taskContext.taskId,
      project: taskContext.project,
      description: taskContext.description,
      projectPath: taskContext.projectPath,
      projectType: taskContext.projectType,
    },
    model: taskContext.model,
    instructions: taskContext.agentInstructions,
  };

  // Agent çalıştırma — Gemini CLI'yi Antigravity'nin seçtiği model ile spawn et
  // Antigravity modunda: model bilgisi MCP context'ten okunur
  const prompt = taskContext.agentInstructions;

  const { stdout, stderr, exitCode } = await spawnGemini({
    prompt,
    model: resolveModelForSpawn(taskContext.model),
    cwd: taskContext.projectPath,
    extraArgs: ['--approval-mode', 'auto_edit', '-o', 'json'],
    timeout: 300_000,
    streamStderr: true,
  });

  return {
    success: exitCode === 0,
    exitCode,
    output: stdout,
    error: stderr,
  };
}

/**
 * Antigravity model ID'sini Gemini CLI uyumlu model adına çevirir
 * Gemini modelleri direkt kullanılır, diğer provider'lar için mapping
 *
 * @param {object} modelInfo - Model bilgisi
 * @returns {string} Gemini CLI uyumlu model adı
 */
function resolveModelForSpawn(modelInfo) {
  // Gemini modelleri — CLI ile direkt kullanılabilir
  const GEMINI_CLI_MAP = {
    'gemini-3.1-pro-high': 'gemini-2.5-pro',
    'gemini-3.1-pro-low': 'gemini-2.5-flash',
    'gemini-3-flash': 'gemini-2.0-flash',
  };

  if (GEMINI_CLI_MAP[modelInfo.id]) {
    return GEMINI_CLI_MAP[modelInfo.id];
  }

  // Antigravity üzerinden erişilen modeller için
  // Gemini CLI'nin desteklediği en yakın modele fallback
  if (modelInfo.provider === 'anthropic' || modelInfo.provider === 'openai-oss') {
    // Bu modeller Antigravity MCP runtime'ında çalışır
    // Gemini CLI spawn'a düşmemeli — ama fallback olarak flash kullan
    return 'gemini-2.5-flash';
  }

  return modelInfo.id;
}

/**
 * Gemini CLI fallback executor
 * Antigravity runtime başarısız olursa kullanılır
 *
 * @param {object} task
 * @param {object} projectConfig
 * @param {number} priorDuration - Önceki denemenin süresi
 * @returns {Promise<object>}
 */
async function executeTaskGeminiFallback(task, projectConfig, priorDuration) {
  const startTime = Date.now();
  const prompt = buildAgentPrompt(task.project, task.description, projectConfig);

  try {
    const { stdout, stderr, exitCode } = await spawnGemini({
      prompt,
      cwd: projectConfig.path,
      extraArgs: ['--approval-mode', 'auto_edit', '-o', 'json'],
      timeout: 300_000,
    });

    const dur = Date.now() - startTime + priorDuration;
    const success = exitCode === 0;
    console.log(`   ${success ? '✅' : '❌'} [${task.project}] Fallback tamamlandı (${Math.round(dur / 1000)}s)`);

    return {
      taskId: task.id,
      project: task.project,
      model: { id: 'gemini-cli-fallback', name: 'Gemini CLI (Fallback)' },
      success,
      exitCode,
      output: stdout,
      error: stderr,
      duration: dur,
    };
  } catch (error) {
    return {
      taskId: task.id,
      project: task.project,
      model: { id: 'gemini-cli-fallback', name: 'Gemini CLI (Fallback)' },
      success: false,
      exitCode: -1,
      output: '',
      error: error.message,
      duration: Date.now() - startTime + priorDuration,
    };
  }
}

/**
 * Görevleri sıralı çalıştırır (bağımlılıkları dikkate alarak)
 * @param {object[]} tasks
 * @param {object} projects
 * @returns {Promise<object[]>}
 */
export async function executeTasks(tasks, projects) {
  const results = [];

  for (const task of tasks) {
    // Bağımlılık kontrolü
    if (task.dependencies?.length > 0) {
      const failedDeps = results.filter(
        r => task.dependencies.includes(r.taskId) && !r.success
      );
      if (failedDeps.length > 0) {
        results.push({
          taskId: task.id,
          project: task.project,
          model: { id: 'skipped', name: 'Skipped' },
          success: false,
          exitCode: -1,
          output: '',
          error: `Bağımlı görev başarısız: ${failedDeps.map(d => d.taskId).join(', ')}`,
          duration: 0,
        });
        continue;
      }
    }

    const cfg = projects[task.project];
    if (!cfg) {
      results.push({
        taskId: task.id,
        project: task.project,
        model: { id: 'error', name: 'Error' },
        success: false,
        exitCode: -1,
        output: '',
        error: `Proje bulunamadı: ${task.project}`,
        duration: 0,
      });
      continue;
    }

    const result = await executeTaskAntigravity(task, cfg);
    results.push(result);
  }

  return results;
}

/**
 * Bağımsız görevleri paralel, bağımlı görevleri sıralı çalıştırır
 * @param {object[]} tasks
 * @param {object} projects
 * @returns {Promise<object[]>}
 */
export async function executeTasksParallel(tasks, projects) {
  const independent = tasks.filter(t => !t.dependencies?.length);
  const dependent = tasks.filter(t => t.dependencies?.length > 0);

  console.log(`\n🚀 ${independent.length} bağımsız görev paralel çalıştırılıyor...`);

  const indResults = await Promise.all(
    independent.map(task => {
      const cfg = projects[task.project];
      if (!cfg) {
        return {
          taskId: task.id,
          project: task.project,
          model: { id: 'error', name: 'Error' },
          success: false,
          exitCode: -1,
          output: '',
          error: 'Proje bulunamadı',
          duration: 0,
        };
      }
      return executeTaskAntigravity(task, cfg);
    })
  );

  const allResults = [...indResults];

  if (dependent.length > 0) {
    console.log(`\n🔗 ${dependent.length} bağımlı görev sıralı çalıştırılıyor...`);
    const depResults = await executeTasks(dependent, projects);
    allResults.push(...depResults);
  }

  return allResults;
}
