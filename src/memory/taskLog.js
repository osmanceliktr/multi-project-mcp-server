/**
 * Görev Loglama
 * Tüm orkestrasyon görevlerini JSON dosyasına loglar
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', '..', 'logs');
const LOG_FILE = join(LOG_DIR, 'tasks.json');

/**
 * Log dosyasına yeni kayıt ekler
 * @param {object} entry - Log kaydı
 */
export async function appendLog(entry) {
  try {
    if (!existsSync(LOG_DIR)) {
      await mkdir(LOG_DIR, { recursive: true });
    }

    let logs = [];
    if (existsSync(LOG_FILE)) {
      const content = await readFile(LOG_FILE, 'utf-8');
      logs = JSON.parse(content);
    }

    logs.push(entry);

    // Son 100 kaydı tut
    if (logs.length > 100) {
      logs = logs.slice(-100);
    }

    await writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Log yazma hatası:', err.message);
  }
}

/**
 * Son N log kaydını döner
 * @param {number} count - Kayıt sayısı
 * @returns {Promise<object[]>}
 */
export async function getRecentLogs(count = 10) {
  try {
    if (!existsSync(LOG_FILE)) return [];
    const content = await readFile(LOG_FILE, 'utf-8');
    const logs = JSON.parse(content);
    return logs.slice(-count);
  } catch {
    return [];
  }
}
