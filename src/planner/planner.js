/**
 * Çoklu-Backend Görev Planlayıcı
 *
 * Seçili planner modeline göre uygun backend'i kullanır:
 * - Groq modelleri → Groq API (ultra hızlı)
 * - Gemini modelleri → Gemini CLI spawn
 * - Diğer → Gemini CLI fallback
 */

import { spawnGemini, getPlannerModel } from '../utils/geminiSpawn.js';
import { callGroq, fromRegistryId } from '../utils/groqClient.js';
import { PLANNER_SYSTEM_PROMPT } from '../prompts/systemPrompts.js';
import { classifyProjects, enrichPromptWithContext } from './projectClassifier.js';
import { getActivePlannerId } from '../models/modelConfig.js';
import { findModel } from '../models/modelRegistry.js';

/**
 * Planner modeline göre uygun backend'i seçer ve çağırır
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - Kullanıcı prompt'u
 * @returns {Promise<string>} LLM yanıtı
 */
async function callPlanner(systemPrompt, userPrompt) {
  const modelId = await getActivePlannerId();
  const model = await findModel(modelId);
  const provider = model?.provider || 'google';

  // Groq modelleri → Groq API
  if (provider === 'groq') {
    const groqModelId = model?.groqModelId || fromRegistryId(modelId);
    console.log(`   🟡 Groq API → ${groqModelId}`);

    return await callGroq({
      model: groqModelId,
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 4096,
      timeout: 60_000,
    });
  }

  // Gemini modelleri → Gemini CLI spawn
  if (provider === 'google') {
    const fullPrompt = `${systemPrompt}\n\n---\n\nKullanıcı Talebi:\n${userPrompt}`;
    const cliModel = model?.geminiCliModel || getPlannerModel();
    console.log(`   🔵 Gemini CLI → ${cliModel}`);

    const { stdout, stderr, exitCode } = await spawnGemini({
      prompt: fullPrompt,
      model: cliModel,
      timeout: 120_000,
      streamStderr: true,
    });

    if (exitCode !== 0) {
      throw new Error(`Gemini CLI hata döndü (code: ${exitCode}):\n${stderr || stdout}`);
    }

    return stdout;
  }

  // Diğer provider'lar → Gemini CLI fallback
  console.log(`   ⚠️ Provider "${provider}" için doğrudan API yok, Gemini CLI fallback kullanılıyor`);
  const fullPrompt = `${systemPrompt}\n\n---\n\nKullanıcı Talebi:\n${userPrompt}`;

  const { stdout, stderr, exitCode } = await spawnGemini({
    prompt: fullPrompt,
    model: getPlannerModel(),
    timeout: 120_000,
    streamStderr: true,
  });

  if (exitCode !== 0) {
    throw new Error(`Gemini CLI hata döndü (code: ${exitCode}):\n${stderr || stdout}`);
  }

  return stdout;
}

/**
 * LLM çıktısından JSON bloğunu çıkarır
 * LLM bazen JSON'u markdown code fence içinde döner
 * @param {string} raw - Ham LLM çıktısı
 * @returns {object} Parse edilmiş JSON
 */
function extractJSON(raw) {
  // Direkt JSON parse dene
  try {
    return JSON.parse(raw);
  } catch {
    // Markdown code fence içinden çıkar: ```json ... ``` veya ``` ... ```
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // devam et
      }
    }

    // Son çare: İlk { ile son } arasını al
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.substring(firstBrace, lastBrace + 1));
      } catch {
        // devam et
      }
    }

    throw new Error(`Planner geçersiz JSON döndü:\n${raw.substring(0, 500)}`);
  }
}

/**
 * Kullanıcı prompt'unu analiz edip görev planı oluşturur
 * @param {string} userPrompt - Kullanıcının doğal dil talebi
 * @param {object} projects - projects.json içeriği
 * @returns {Promise<object>} Görev planı
 */
export async function createPlan(userPrompt, projects) {
  // 1) Ön sınıflandırma (anahtar kelime bazlı)
  const suggestedProjects = classifyProjects(userPrompt);
  console.log(
    `\n🔍 Ön analiz — Olası projeler: ${suggestedProjects.length > 0 ? suggestedProjects.join(', ') : '(belirsiz)'}`
  );

  // 2) Prompt'u zenginleştir
  const enrichedPrompt = enrichPromptWithContext(userPrompt, suggestedProjects);

  // 3) Seçili planner backend ile plan oluştur
  const modelId = await getActivePlannerId();
  const model = await findModel(modelId);
  const modelName = model?.name || modelId;
  console.log(`🧠 Planner çalışıyor → ${modelName}...`);

  const llmResponse = await callPlanner(PLANNER_SYSTEM_PROMPT, enrichedPrompt);

  // 4) JSON parse (akıllı çıkarma)
  const plan = extractJSON(llmResponse);

  // 5) Validasyon
  if (!plan.tasks || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    throw new Error('Planner görev üretemedi. Prompt daha spesifik olmalı.');
  }

  // 6) Projelerin geçerliliğini kontrol et
  const validProjects = Object.keys(projects);
  for (const task of plan.tasks) {
    if (!validProjects.includes(task.project)) {
      throw new Error(
        `Geçersiz proje: "${task.project}". Geçerli projeler: ${validProjects.join(', ')}`
      );
    }
  }

  // 7) Görevleri önceliğe göre sırala
  plan.tasks.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  return plan;
}

/**
 * Sonuçları özetler
 * @param {object[]} results - Executor sonuçları
 * @returns {Promise<string>} Kullanıcı dostu özet
 */
export async function summarizeResults(results) {
  const summary = results.map((r) => {
    const status = r.success ? '✅' : '❌';
    const output = r.output
      ? r.output.substring(0, 500)
      : '(çıktı yok)';
    return `${status} [${r.project}] — ${output}`;
  });

  return summary.join('\n\n');
}
