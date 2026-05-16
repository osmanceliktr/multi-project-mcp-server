/**
 * Agent prompt builder
 * Her proje için Gemini CLI'ye gönderilecek nihai prompt'u oluşturur
 */

import { PROJECT_CONTEXT } from '../prompts/systemPrompts.js';

/**
 * Gemini CLI'ye gönderilecek prompt'u oluşturur
 * @param {string} projectKey - projects.json key'i (frontend, backend, vb.)
 * @param {string} taskDescription - Planner'ın ürettiği görev açıklaması
 * @param {object} projectConfig - projects.json'dan proje konfigürasyonu
 * @returns {string} Nihai prompt
 */
export function buildAgentPrompt(projectKey, taskDescription, projectConfig) {
  const context = PROJECT_CONTEXT[projectKey] || '';

  return `## Proje Bağlamı
${context}

## Proje Bilgileri
- Proje: ${projectKey}
- Yol: ${projectConfig.path}
- Teknoloji: ${projectConfig.type}

## Görev
${taskDescription}

## Önemli
- Değişiklik yapacağın dosyaları belirt
- Mevcut kodu bozmadan çalış
- Hata olasılığı varsa açıkla
`;
}
