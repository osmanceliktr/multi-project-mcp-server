/**
 * CLI İnteraktif Model Seçici
 *
 * Terminal üzerinden model seçim arayüzü sağlar.
 * Provider bazlı gruplama, aktif model vurgulama, rol seçimi.
 */

import readline from 'readline';
import {
  getModelsByProvider, getAvailableModels, findModel,
  registerModel, removeModel, generateModelId, getKnownProviders,
} from './modelRegistry.js';
import { getActivePlannerId, getActiveExecutorId, switchModel } from './modelConfig.js';

/** Provider isimleri ve renk ikonları */
const PROVIDER_META = {
  google: { label: 'Google', icon: '🔵' },
  anthropic: { label: 'Anthropic', icon: '🟠' },
  groq: { label: 'Groq', icon: '🟡' },
  'openai-oss': { label: 'OpenAI-OSS', icon: '🟢' },
  unknown: { label: 'Diğer', icon: '⚪' },
};

/** Speed ve quality göstergeleri */
const SPEED_ICONS = { fast: '⚡⚡⚡', medium: '⚡⚡', slow: '⚡' };
const QUALITY_ICONS = { highest: '★★★', high: '★★', medium: '★' };

/**
 * Tüm modelleri formatlı şekilde terminale yazdırır
 * Aktif planner ve executor işaretlenir
 */
export async function displayModels() {
  const grouped = await getModelsByProvider();
  const plannerId = await getActivePlannerId();
  const executorId = await getActiveExecutorId();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          🤖 Antigravity Model Registry                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let index = 1;
  const indexMap = [];

  for (const [provider, models] of Object.entries(grouped)) {
    const meta = PROVIDER_META[provider] || PROVIDER_META.unknown;
    console.log(`  ${meta.icon} ${meta.label}`);
    console.log('  ' + '─'.repeat(50));

    for (const model of models) {
      const roles = [];
      if (model.id === plannerId) roles.push('🧠 planner');
      if (model.id === executorId) roles.push('⚡ executor');
      const roleTag = roles.length > 0 ? ` ← ${roles.join(', ')}` : '';

      const speed = SPEED_ICONS[model.speed] || '';
      const quality = QUALITY_ICONS[model.quality] || '';

      const activeMarker = roles.length > 0 ? '►' : ' ';

      console.log(`${activeMarker} [${String(index)}] ${model.name}`);
      console.log(`       Hız: ${speed}  Kalite: ${quality}  Tier: ${model.tier}${roleTag}`);

      indexMap.push(model.id);
      index++;
    }

    console.log('');
  }

  return indexMap;
}

/**
 * İnteraktif model seçici — kullanıcıdan numara ve rol alır
 * @param {readline.Interface} rl - readline interface
 * @returns {Promise<{ modelId: string, role: string } | null>} Seçim sonucu
 */
export async function interactiveModelPicker(rl) {
  const indexMap = await displayModels();

  return new Promise((resolve) => {
    console.log('  Kullanım:');
    console.log('    model set planner <numara>    → Planner modelini değiştir');
    console.log('    model set executor <numara>   → Executor modelini değiştir');
    console.log('    model set both <numara>       → Her ikisini değiştir');
    console.log('    enter                         → İptal\n');

    rl.question('  Seçim > ', async (input) => {
      const trimmed = input.trim().toLowerCase();

      if (!trimmed) {
        resolve(null);
        return;
      }

      // "model set <role> <number>" formatı
      const match = trimmed.match(/^(?:model\s+)?set\s+(planner|executor|both)\s+(\d+)$/);
      if (!match) {
        console.log('  ❌ Geçersiz format. Örnek: set executor 5\n');
        resolve(null);
        return;
      }

      const role = match[1];
      const num = parseInt(match[2], 10);

      if (num < 1 || num > indexMap.length) {
        console.log(`  ❌ Geçersiz numara. 1-${indexMap.length} arası girin.\n`);
        resolve(null);
        return;
      }

      const modelId = indexMap[num - 1];
      const model = await findModel(modelId);

      if (role === 'both') {
        const s1 = await switchModel('planner', modelId);
        const s2 = await switchModel('executor', modelId);
        if (s1 && s2) {
          console.log(`\n  ✅ Planner & Executor → ${model.name}\n`);
        }
      } else {
        const success = await switchModel(role, modelId);
        if (success) {
          const roleLabel = role === 'planner' ? '🧠 Planner' : '⚡ Executor';
          console.log(`\n  ✅ ${roleLabel} → ${model.name}\n`);
        } else {
          console.log(`\n  ❌ Model bulunamadı: ${modelId}\n`);
        }
      }

      resolve({ modelId, role });
    });
  });
}

/**
 * Model bilgisini kısa formatta döner (banner için)
 * @returns {Promise<string>}
 */
export async function getModelBannerText() {
  const plannerId = await getActivePlannerId();
  const executorId = await getActiveExecutorId();
  const planner = await findModel(plannerId);
  const executor = await findModel(executorId);

  const pName = planner?.name || plannerId;
  const eName = executor?.name || executorId;
  const pIcon = PROVIDER_META[planner?.provider]?.icon || '⚪';
  const eIcon = PROVIDER_META[executor?.provider]?.icon || '⚪';

  return {
    plannerText: `${pIcon} ${pName}`,
    executorText: `${eIcon} ${eName}`,
  };
}

/**
 * Model status komutunu işle — "model" veya "model list"
 * @param {string} input
 * @param {readline.Interface} rl
 * @returns {Promise<boolean>} İşlendi mi
 */
export async function handleModelCommand(input, rl) {
  const trimmed = input.trim().toLowerCase();
  const originalInput = input.trim();

  // "model" — aktif modelleri göster
  if (trimmed === 'model' || trimmed === 'models') {
    const banner = await getModelBannerText();
    console.log(`\n  🧠 Planner:  ${banner.plannerText}`);
    console.log(`  ⚡ Executor: ${banner.executorText}\n`);
    return true;
  }

  // "model list" — tüm modelleri listele + interaktif seçim
  if (trimmed === 'model list' || trimmed === 'model pick') {
    await interactiveModelPicker(rl);
    return true;
  }

  // "model add" — yeni model ekle (interaktif)
  if (trimmed === 'model add') {
    await interactiveModelAdd(rl);
    return true;
  }

  // "model add <name>" — hızlı ekleme (tek satır)
  const quickAddMatch = originalInput.match(/^model\s+add\s+(.+)$/i);
  if (quickAddMatch) {
    const name = quickAddMatch[1].trim();
    await quickModelAdd(name, rl);
    return true;
  }

  // "model remove <numara>" — model kaldır
  const removeMatch = trimmed.match(/^model\s+(?:remove|delete|rm)\s+(\S+)$/);
  if (removeMatch) {
    const target = removeMatch[1];
    await handleModelRemove(target);
    return true;
  }

  // "model sync groq" — Groq'tan canlı model keşfi
  if (trimmed === 'model sync groq' || trimmed === 'model sync') {
    await syncGroqModels();
    return true;
  }

  // "model set planner/executor <model-id>" — direkt ID ile değiştir
  const setMatch = trimmed.match(/^model\s+set\s+(planner|executor|both)\s+(.+)$/);
  if (setMatch) {
    const role = setMatch[1];
    const modelId = setMatch[2].trim();

    const model = await findModel(modelId);
    if (!model) {
      // Numara mı girilmiş?
      const num = parseInt(modelId, 10);
      if (!isNaN(num)) {
        const models = await getAvailableModels();
        if (num >= 1 && num <= models.length) {
          const selectedId = models[num - 1].id;
          if (role === 'both') {
            await switchModel('planner', selectedId);
            await switchModel('executor', selectedId);
            console.log(`\n  ✅ Planner & Executor → ${models[num - 1].name}\n`);
          } else {
            await switchModel(role, selectedId);
            const roleLabel = role === 'planner' ? '🧠 Planner' : '⚡ Executor';
            console.log(`\n  ${roleLabel} → ${models[num - 1].name}\n`);
          }
          return true;
        }
      }

      console.log(`\n  ❌ Model bulunamadı: ${modelId}`);
      console.log('  💡 "model list" ile mevcut modelleri görüntüle\n');
      return true;
    }

    if (role === 'both') {
      await switchModel('planner', modelId);
      await switchModel('executor', modelId);
      console.log(`\n  ✅ Planner & Executor → ${model.name}\n`);
    } else {
      await switchModel(role, modelId);
      const roleLabel = role === 'planner' ? '🧠 Planner' : '⚡ Executor';
      console.log(`\n  ✅ ${roleLabel} → ${model.name}\n`);
    }
    return true;
  }

  // Legacy uyumluluk: "model planner <id>" veya "model executor <id>"
  const legacyMatch = trimmed.match(/^model\s+(planner|executor)\s+(.+)$/);
  if (legacyMatch) {
    const role = legacyMatch[1];
    const modelId = legacyMatch[2].trim();
    const model = await findModel(modelId);

    if (!model) {
      console.log(`\n  ❌ Model bulunamadı: ${modelId}`);
      console.log('  💡 "model list" ile mevcut modelleri görüntüle\n');
      return true;
    }

    await switchModel(role, modelId);
    const roleLabel = role === 'planner' ? '🧠 Planner' : '⚡ Executor';
    console.log(`\n  ✅ ${roleLabel} → ${model.name}\n`);
    return true;
  }

  return false;
}

/**
 * İnteraktif yeni model ekleme
 * Kullanıcıdan adım adım bilgi alır
 * @param {readline.Interface} rl
 */
async function interactiveModelAdd(rl) {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║     ➕ Yeni Model Ekle               ║');
  console.log('  ╚══════════════════════════════════════╝\n');

  const askQuestion = (question) => new Promise(resolve => rl.question(question, resolve));

  // 1. Model adı
  const name = await askQuestion('  📝 Model adı (örn: Claude 4 Opus): ');
  if (!name.trim()) {
    console.log('  ❌ İptal edildi.\n');
    return;
  }

  // 2. Provider
  const providers = await getKnownProviders();
  console.log(`  📦 Bilinen provider'lar: ${providers.join(', ')}`);
  const provider = await askQuestion('  📦 Provider (veya yeni girin): ');
  if (!provider.trim()) {
    console.log('  ❌ İptal edildi.\n');
    return;
  }

  // 3. Tier
  const tier = await askQuestion('  🏷️  Tier (fast/medium/high/thinking/thinking-max): ');

  // 4. Speed
  const speed = await askQuestion('  ⚡ Hız (fast/medium/slow): ');

  // 5. Quality
  const quality = await askQuestion('  ★  Kalite (medium/high/highest): ');

  // ID oluştur
  const id = generateModelId(name.trim());

  const model = {
    id,
    name: name.trim(),
    provider: provider.trim().toLowerCase(),
    tier: tier.trim() || 'medium',
    capabilities: ['code', 'analysis'],
    speed: speed.trim() || 'medium',
    quality: quality.trim() || 'high',
    recommended_for: ['executor'],
  };

  // Thinking/reasoning tier ise ek yetenekler
  if (model.tier.includes('thinking')) {
    model.capabilities.push('planning', 'thinking', 'reasoning');
    model.recommended_for.push('planner');
  }

  const result = await registerModel(model);
  console.log(`\n  ✅ Model ${result.action === 'added' ? 'eklendi' : 'güncellendi'}: ${model.name}`);
  console.log(`     ID: ${model.id}`);
  console.log(`     Provider: ${model.provider}\n`);
}

/**
 * Hızlı model ekleme — sadece isimle
 * Provider ve tier otomatik çıkarılır
 * @param {string} name - Model adı (örn: "Gemini 4 Ultra")
 * @param {readline.Interface} rl
 */
async function quickModelAdd(name, rl) {
  const id = generateModelId(name);

  // Mevcut mu?
  const existing = await findModel(id);
  if (existing) {
    console.log(`\n  ⚠️  Bu model zaten kayıtlı: ${existing.name} (${existing.id})\n`);
    return;
  }

  // Provider otomatik tespit
  const lowerName = name.toLowerCase();
  let provider = 'unknown';
  if (lowerName.includes('gemini')) provider = 'google';
  else if (lowerName.includes('claude')) provider = 'anthropic';
  else if (lowerName.includes('gpt')) provider = 'openai-oss';

  // Tier ve speed otomatik tespit
  let tier = 'medium';
  let speed = 'medium';
  let quality = 'high';
  const capabilities = ['code', 'analysis'];
  const recommended_for = ['executor'];

  if (lowerName.includes('flash') || lowerName.includes('lite')) {
    tier = 'fast';
    speed = 'fast';
    quality = 'medium';
  } else if (lowerName.includes('pro') || lowerName.includes('opus') || lowerName.includes('ultra')) {
    tier = 'high';
    speed = 'slow';
    quality = 'highest';
    recommended_for.push('planner');
  }

  if (lowerName.includes('thinking') || lowerName.includes('reason')) {
    tier = 'thinking';
    capabilities.push('planning', 'thinking', 'reasoning');
    recommended_for.push('planner');
  }

  const model = { id, name, provider, tier, capabilities, speed, quality, recommended_for };
  const result = await registerModel(model);

  console.log(`\n  ✅ Model ${result.action === 'added' ? 'eklendi' : 'güncellendi'}:`);
  console.log(`     📛 ${model.name}`);
  console.log(`     🆔 ${model.id}`);
  console.log(`     📦 ${model.provider} | ⚡ ${model.speed} | ★ ${model.quality}`);
  console.log(`     💡 "model list" ile doğrulayın\n`);
}

/**
 * Model kaldırma işlemi
 * Numara veya ID ile çalışır
 * @param {string} target - Model numarası veya ID
 */
async function handleModelRemove(target) {
  let modelId = target;

  // Numara girilmiş mi?
  const num = parseInt(target, 10);
  if (!isNaN(num)) {
    const models = await getAvailableModels();
    if (num >= 1 && num <= models.length) {
      modelId = models[num - 1].id;
    } else {
      console.log(`\n  ❌ Geçersiz numara. 1-${models.length} arası girin.\n`);
      return;
    }
  }

  const result = await removeModel(modelId);
  if (result.success) {
    console.log(`\n  ✅ ${result.message}\n`);
  } else {
    console.log(`\n  ❌ ${result.message}\n`);
  }
}

/**
 * Groq API'den canlı model listesini çeker ve registry'ye kaydeder
 */
async function syncGroqModels() {
  console.log('\n  🔄 Groq API\'den modeller çekiliyor...');

  try {
    const { fetchGroqModels, toRegistryId } = await import('../utils/groqClient.js');
    const groqModels = await fetchGroqModels();

    if (groqModels.length === 0) {
      console.log('  ⚠️  Groq\'tan model alınamadı. API key doğru mu?\n');
      return;
    }

    console.log(`  📦 ${groqModels.length} model bulundu:\n`);

    let added = 0;
    let updated = 0;

    for (const gm of groqModels) {
      const registryId = toRegistryId(gm.groqId);
      const existing = await findModel(registryId);

      const model = {
        id: registryId,
        name: `${gm.groqId} (Groq)`,
        provider: 'groq',
        groqModelId: gm.groqId,
        tier: 'fast',
        capabilities: ['code', 'analysis', 'planning'],
        speed: 'fast',
        quality: gm.groqId.includes('70b') || gm.groqId.includes('32b') ? 'high' : 'medium',
        recommended_for: ['planner'],
      };

      const result = await registerModel(model);
      if (result.action === 'added') {
        console.log(`     ✅ Eklendi: ${gm.groqId}`);
        added++;
      } else {
        updated++;
      }
    }

    console.log(`\n  📊 Sonuç: ${added} yeni, ${updated} güncellenen`);
    console.log('  💡 "model list" ile listeyi görebilirsiniz\n');
  } catch (error) {
    console.log(`  ❌ Hata: ${error.message}\n`);
  }
}
