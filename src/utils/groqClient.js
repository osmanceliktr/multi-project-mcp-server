/**
 * Groq API Client
 *
 * Groq'un ultra-hızlı LPU inference engine'ine bağlanır.
 * OpenAI-uyumlu API kullanır — planner için ideal.
 *
 * Endpoint: https://api.groq.com/openai/v1/chat/completions
 * Model listesi: GET https://api.groq.com/openai/v1/models
 */

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Groq API key kontrolü
 * @returns {string} API key
 */
function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      'GROQ_API_KEY tanımlı değil!\n' +
      '→ https://console.groq.com/keys adresinden ücretsiz anahtar al\n' +
      '→ .env dosyasına ekle: GROQ_API_KEY=gsk_...'
    );
  }
  return key;
}

/**
 * Groq Chat Completions API çağrısı
 *
 * @param {object} options
 * @param {string} options.model - Groq model ID (örn: llama-3.3-70b-versatile)
 * @param {string} options.systemPrompt - System prompt
 * @param {string} options.userPrompt - Kullanıcı prompt'u
 * @param {number} [options.temperature=0.3] - Sıcaklık (planner için düşük tutulur)
 * @param {number} [options.maxTokens=4096] - Maksimum token
 * @param {number} [options.timeout=60000] - Timeout (ms)
 * @returns {Promise<string>} LLM yanıtı
 */
export async function callGroq({
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.3,
  maxTokens = 4096,
  timeout = 60_000,
}) {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Groq API hatası (${response.status}): ${errorBody.substring(0, 500)}`
      );
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Groq API boş yanıt döndü');
    }

    // Kullanım istatistiklerini logla
    if (data.usage) {
      const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
      const speed = data.usage.total_time
        ? `${Math.round(completion_tokens / data.usage.total_time)} tok/s`
        : '';
      console.log(
        `   📊 Groq: ${prompt_tokens}+${completion_tokens}=${total_tokens} token ${speed}`
      );
    }

    return data.choices[0].message.content;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`Groq API zaman aşımı (${timeout / 1000}s)`);
    }

    throw error;
  }
}

/**
 * Groq'tan kullanılabilir modelleri çeker (canlı keşif)
 *
 * @returns {Promise<object[]>} Model listesi
 */
export async function fetchGroqModels() {
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Groq models API hatası: ${response.status}`);
    }

    const data = await response.json();

    // Sadece chat modellerini filtrele (whisper/guard hariç)
    const chatModels = (data.data || []).filter(m => {
      const id = m.id.toLowerCase();
      return !id.includes('whisper') &&
             !id.includes('guard') &&
             !id.includes('tool-use');
    });

    return chatModels.map(m => ({
      groqId: m.id,
      name: m.id,
      ownedBy: m.owned_by,
      contextWindow: m.context_window,
      active: m.active,
    }));
  } catch (error) {
    console.error(`   ⚠️ Groq model listesi alınamadı: ${error.message}`);
    return [];
  }
}

/**
 * Groq model ID'sini registry-uyumlu formata dönüştürür
 * Örn: "llama-3.3-70b-versatile" → "groq-llama-3.3-70b-versatile"
 *
 * @param {string} groqModelId
 * @returns {string}
 */
export function toRegistryId(groqModelId) {
  // "meta-llama/llama-4-scout..." gibi namespace'li ID'leri düzelt
  const clean = groqModelId.replace(/\//g, '-');
  return `groq-${clean}`;
}

/**
 * Registry model ID'sinden Groq API model ID'sine çevirir
 * Örn: "groq-llama-3.3-70b-versatile" → "llama-3.3-70b-versatile"
 *
 * @param {string} registryId
 * @returns {string}
 */
export function fromRegistryId(registryId) {
  if (!registryId.startsWith('groq-')) return registryId;

  const raw = registryId.replace(/^groq-/, '');

  // Bilinen namespace'leri geri dönüştür
  const NAMESPACES = ['meta-llama', 'openai', 'qwen', 'groq'];
  for (const ns of NAMESPACES) {
    if (raw.startsWith(`${ns}-`)) {
      return `${ns}/${raw.substring(ns.length + 1)}`;
    }
  }

  return raw;
}
