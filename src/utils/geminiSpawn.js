/**
 * Gemini CLI Spawn Utility
 * Windows'ta cmd.exe shell escaping sorunlarını bypass eder
 * Gemini CLI'nin JS entry point'ini doğrudan node.exe ile çalıştırır
 */

import { spawn, execSync } from 'child_process';
import { join } from 'path';

let _geminiBinPath = null;

/**
 * Gemini CLI'nin gerçek JS dosya yolunu bulur
 */
function resolveGeminiBin() {
  if (_geminiBinPath) return _geminiBinPath;

  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    _geminiBinPath = join(npmRoot, '@google', 'gemini-cli', 'bundle', 'gemini.js');
    return _geminiBinPath;
  } catch (err) {
    throw new Error(
      `Gemini CLI bulunamadı. Yüklü mü?\n→ npm install -g @google/gemini-cli\n${err.message}`
    );
  }
}

/**
 * Gemini CLI'yi shell kullanmadan doğrudan node.exe ile spawn eder
 *
 * @param {object} options
 * @param {string} options.prompt - Gemini'ye gönderilecek prompt
 * @param {string} [options.cwd] - Çalışma dizini
 * @param {string[]} [options.extraArgs] - Ek CLI argümanları
 * @param {number} [options.timeout] - Timeout (ms)
 * @param {boolean} [options.streamStderr] - stderr'i gerçek zamanlı göster
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
/** Planner modeli — Gemini CLI fallback için */
export function getPlannerModel() {
  return process.env.GEMINI_PLANNER_MODEL || 'gemini-2.5-flash';
}

export function spawnGemini({ prompt, model, cwd, extraArgs = [], timeout = 120_000, streamStderr = false }) {
  const geminiBin = resolveGeminiBin();
  const useModel = model || getPlannerModel();

  return new Promise((resolve, reject) => {
    const args = [
      geminiBin,
      '--skip-trust',
      '-m', useModel,
      '-p', prompt,
      ...extraArgs,
    ];

    // spawn fonksiyonu ile gemini'yi çalıştırıyoruz
    const child = spawn(process.execPath, args, {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        GEMINI_CLI_TRUST_WORKSPACE: 'true',
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      // Gemini CLI ilerleme bilgilerini stderr'e yazar — gerçek zamanlı göster
      if (streamStderr) {
        process.stderr.write(`   ${chunk}`);
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Gemini CLI başlatılamadı: ${error.message}`));
    });

    child.on('close', (exitCode) => {
      resolve({ stdout: stdout.trim(), stderr, exitCode });
    });
  });
}
