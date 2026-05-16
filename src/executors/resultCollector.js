/**
 * Sonuç Toplayıcı
 * Executor sonuçlarını formatlar ve loglar
 * Model bilgisi desteği eklendi
 */

import { appendLog } from '../memory/taskLog.js';

/**
 * Sonuçları formatlar ve loglar
 * @param {object[]} results - Executor sonuçları
 * @param {string} originalPrompt - Kullanıcının orijinal prompt'u
 * @returns {string} Formatlanmış özet
 */
export async function collectAndFormat(results, originalPrompt) {
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  let output = '\n' + '═'.repeat(60) + '\n';
  output += '📊 GÖREV SONUÇLARI\n';
  output += '═'.repeat(60) + '\n\n';

  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    const modelName = r.model?.name || 'Unknown';
    output += `${icon} ${r.project.toUpperCase()} [${modelName}]\n`;
    output += `   Süre: ${Math.round(r.duration / 1000)}s\n`;

    if (r.output) {
      // JSON çıktısını parse etmeye çalış
      try {
        const parsed = JSON.parse(r.output);
        output += `   Çıktı: ${JSON.stringify(parsed).substring(0, 300)}\n`;
      } catch {
        output += `   Çıktı: ${r.output.substring(0, 300)}\n`;
      }
    }

    if (!r.success && r.error) {
      output += `   Hata: ${r.error.substring(0, 200)}\n`;
    }

    output += '\n';
  }

  output += '─'.repeat(60) + '\n';
  output += `Toplam: ${results.length} görev | ✅ ${successCount} başarılı | ❌ ${failCount} başarısız\n`;
  output += `Süre: ${Math.round(totalDuration / 1000)}s\n`;
  output += '═'.repeat(60) + '\n';

  // Logla
  await appendLog({
    timestamp: new Date().toISOString(),
    prompt: originalPrompt,
    results: results.map(r => ({
      project: r.project,
      success: r.success,
      duration: r.duration,
      model: r.model?.name || 'unknown',
    })),
    summary: { total: results.length, success: successCount, fail: failCount },
  });

  return output;
}
