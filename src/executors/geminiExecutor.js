/**
 * Gemini CLI Executor
 * Her görev için Gemini CLI'yi headless modda spawn eder
 */

import { spawnGemini } from '../utils/geminiSpawn.js';
import { buildAgentPrompt } from '../agents/agentPrompts.js';

/**
 * Tek bir görevi Gemini CLI ile çalıştırır
 */
export async function executeTask(task, projectConfig) {
  const startTime = Date.now();
  const prompt = buildAgentPrompt(task.project, task.description, projectConfig);

  console.log(`\n⚡ [${task.project}] Görev başlatılıyor...`);
  console.log(`   📁 Dizin: ${projectConfig.path}`);

  try {
    const { stdout, stderr, exitCode } = await spawnGemini({
      prompt,
      cwd: projectConfig.path,
      extraArgs: ['--approval-mode', 'auto_edit', '-o', 'json'],
      timeout: 300_000,
    });

    const dur = Date.now() - startTime;
    const success = exitCode === 0;
    console.log(`   ${success ? '✅' : '❌'} [${task.project}] Tamamlandı (${Math.round(dur / 1000)}s)`);

    return { taskId: task.id, project: task.project, success, exitCode, output: stdout, error: stderr, duration: dur };
  } catch (error) {
    return { taskId: task.id, project: task.project, success: false, exitCode: -1, output: '', error: error.message, duration: Date.now() - startTime };
  }
}

/**
 * Görevleri sıralı çalıştırır (bağımlılıkları dikkate alarak)
 */
export async function executeTasks(tasks, projects) {
  const results = [];
  const completed = new Set();

  for (const task of tasks) {
    // Bağımlılık kontrolü
    if (task.dependencies?.length > 0) {
      const failedDeps = results.filter(r => task.dependencies.includes(r.taskId) && !r.success);
      if (failedDeps.length > 0) {
        results.push({ taskId: task.id, project: task.project, success: false, exitCode: -1, output: '', error: `Bağımlı görev başarısız: ${failedDeps.map(d => d.taskId).join(', ')}`, duration: 0 });
        continue;
      }
    }

    const cfg = projects[task.project];
    if (!cfg) {
      results.push({ taskId: task.id, project: task.project, success: false, exitCode: -1, output: '', error: `Proje bulunamadı: ${task.project}`, duration: 0 });
      continue;
    }

    const result = await executeTask(task, cfg);
    results.push(result);
    completed.add(task.id);
  }

  return results;
}

/**
 * Bağımsız görevleri paralel, bağımlı görevleri sıralı çalıştırır
 */
export async function executeTasksParallel(tasks, projects) {
  const independent = tasks.filter(t => !t.dependencies?.length);
  const dependent = tasks.filter(t => t.dependencies?.length > 0);

  console.log(`\n🚀 ${independent.length} bağımsız görev paralel çalıştırılıyor...`);

  const indResults = await Promise.all(
    independent.map(task => {
      const cfg = projects[task.project];
      return cfg ? executeTask(task, cfg) : { taskId: task.id, project: task.project, success: false, exitCode: -1, output: '', error: 'Proje bulunamadı', duration: 0 };
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
