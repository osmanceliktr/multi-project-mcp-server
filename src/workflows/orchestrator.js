/**
 * Ana Orkestrasyon Akışı — Antigravity-Native
 *
 * Kullanıcı prompt'u → Plan → Execute → Sonuç
 * Executor olarak Antigravity agent runtime kullanır.
 * Model seçimi dinamik — planner ve executor ayrı model kullanabilir.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPlan } from '../planner/planner.js';
import { executeTasksParallel } from '../executors/antigravityExecutor.js';
import { collectAndFormat } from '../executors/resultCollector.js';
import { getActivePlannerId, getActiveExecutorId } from '../models/modelConfig.js';
import { findModel } from '../models/modelRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_FILE = join(__dirname, '..', '..', 'projects.json');

/**
 * Projeleri yükler
 */
async function loadProjects() {
  const content = await readFile(PROJECTS_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Ana orkestrasyon fonksiyonu
 * @param {string} userPrompt - Kullanıcının doğal dil talebi
 */
export async function orchestrate(userPrompt) {
  try {
    // Model bilgilerini al
    const plannerId = await getActivePlannerId();
    const executorId = await getActiveExecutorId();
    const plannerModel = await findModel(plannerId);
    const executorModel = await findModel(executorId);

    const plannerName = plannerModel?.name || plannerId;
    const executorName = executorModel?.name || executorId;

    console.log('\n' + '═'.repeat(60));
    console.log('🤖 MCPAgent Orchestrator — Antigravity Runtime');
    console.log(`🧠 Planner:  ${plannerName} (${plannerModel?.provider || '?'})`);
    console.log(`⚡ Executor: ${executorName} (${executorModel?.provider || '?'})`);
    console.log('═'.repeat(60));
    console.log(`\n📝 Prompt: ${userPrompt}\n`);

    // 1) Projeleri yükle
    const projects = await loadProjects();

    // 2) Plan oluştur
    const plan = await createPlan(userPrompt, projects);

    console.log(`\n📋 Plan oluşturuldu — ${plan.tasks.length} görev:`);
    for (const task of plan.tasks) {
      console.log(`   ${task.priority}. [${task.project}] ${task.description.substring(0, 80)}...`);
    }

    if (plan.reasoning) {
      console.log(`\n💡 Gerekçe: ${plan.reasoning}`);
    }

    // 3) Kullanıcı onayı (interaktif modda)
    console.log('\n⏳ Görevler çalıştırılıyor...\n');

    // 4) Görevleri Antigravity executor ile çalıştır
    const results = await executeTasksParallel(plan.tasks, projects);

    // 5) Sonuçları formatla ve logla
    const summary = await collectAndFormat(results, userPrompt);
    console.log(summary);

    return results;
  } catch (error) {
    console.error(`\n❌ Orkestrasyon hatası: ${error.message}`);
    return [];
  }
}
