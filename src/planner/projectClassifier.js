/**
 * Proje Sınıflandırıcı
 * Prompt'taki anahtar kelimelere göre hangi proje(ler)in etkileneceğini belirler
 * LLM çağrısından ÖNCE bir ön filtre görevi görür
 */

/**
 * Anahtar kelime → proje eşleştirmeleri
 * Büyük/küçük harf duyarsız aranır
 */
const PROJECT_KEYWORDS = {
  frontend: [
    'sayfa', 'page', 'component', 'bileşen', 'ui', 'arayüz', 'form',
    'tablo', 'table', 'modal', 'buton', 'button', 'sidebar', 'navbar',
    'dashboard', 'panel', 'layout', 'css', 'tailwind', 'stil', 'style',
    'responsive', 'mobil', 'görünüm', 'tasarım', 'design', 'menu',
    'next.js', 'nextjs', 'react component', 'my-project panel', 'frontend',
    'client', 'liste sayfası', 'detay sayfası', 'input', 'select',
  ],
  backend: [
    'api', 'endpoint', 'route', 'controller', 'service', 'model',
    'veritabanı', 'database', 'db', 'sql', 'query', 'migration',
    'middleware', 'auth', 'authentication', 'jwt', 'token',
    'crud', 'rest', 'get', 'post', 'put', 'delete', 'patch',
    'server', 'sunucu', 'express', 'node api', 'backend',
    'validation', 'doğrulama', 'schema', 'webhook',
  ],
  baileys: [
    'whatsapp', 'wp', 'mesaj', 'message', 'sms', 'baileys',
    'oturum', 'session', 'qr', 'qr kod', 'bağlantı', 'connection',
    'bildirim', 'notification', 'queue', 'kuyruk',
    'whatsapp bağlantı', 'wa', 'mesaj gönder', 'mesaj al',
    'template mesaj', 'broadcast', 'toplu mesaj',
  ],
  root: [
    'root panel', 'merkezi panel', 'yönetim paneli', 'admin panel',
    'my-project yönetimi', 'uygulama yönetimi', 'root', 'ana panel',
    'domain yönetimi', 'kullanıcı yönetimi', 'yetki', 'permission',
    'multi tenant', 'tenant', 'merkezi', 'central',
  ],
  meta: [
    'meta', 'facebook', 'instagram', 'webhook', 'fb', 'ig',
    'meta webhook', 'facebook webhook', 'instagram webhook',
    'meta api', 'graph api', 'php', 'lead', 'form lead',
    'conversions api', 'capi', 'pixel',
  ],
};

/**
 * Prompt'u analiz edip olası projeleri döner
 * @param {string} prompt - Kullanıcı prompt'u
 * @returns {string[]} Eşleşen proje key'leri (sıralı, en alakalı önce)
 */
export function classifyProjects(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const scores = {};

  for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        // Uzun keyword daha spesifik → daha yüksek skor
        score += keyword.length;
      }
    }
    if (score > 0) {
      scores[project] = score;
    }
  }

  // Skora göre sırala
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([project]) => project);

  return sorted;
}

/**
 * Kullanıcı prompt'una ek bağlam ekler (planner'a yardımcı olmak için)
 * @param {string} prompt - Kullanıcı prompt'u
 * @param {string[]} suggestedProjects - classifyProjects sonucu
 * @returns {string} Zenginleştirilmiş prompt
 */
export function enrichPromptWithContext(prompt, suggestedProjects) {
  if (suggestedProjects.length === 0) {
    return `${prompt}\n\n[Sistem: Prompt'tan belirli bir proje tespit edilemedi. Tüm projeler değerlendirilmeli.]`;
  }

  return `${prompt}\n\n[Sistem: Ön analiz bu proje(ler)in etkilenebileceğini gösteriyor: ${suggestedProjects.join(', ')}. Lütfen doğrula veya düzelt.]`;
}
