#!/usr/bin/env node

/**
 * MCPAgent — My Project AI Orchestrator CLI
 * Antigravity-Native Executor ile çoklu model destekli merkezi komut satırı aracı
 *
 * Kullanım:
 *   node cli.js                    → İnteraktif mod
 *   node cli.js -p "prompt"        → Headless mod (tek seferlik)
 *   node cli.js --model-list       → Modelleri listele
 */

import 'dotenv/config';
import readline from 'readline';
import { orchestrate } from './src/workflows/orchestrator.js';
import { handleModelCommand, getModelBannerText, displayModels } from './src/models/modelPicker.js';
import { loadModelConfig } from './src/models/modelRegistry.js';

// Model config'i yükle (ilk çalıştırmada dosya oluşturulur)
await loadModelConfig();

const args = process.argv.slice(2);

// Model listele modu: --model-list
if (args.includes('--model-list')) {
  await displayModels();
  process.exit(0);
}

// Headless mod: -p "prompt" ile çalıştır
const promptFlagIndex = args.indexOf('-p');
if (promptFlagIndex !== -1 && args[promptFlagIndex + 1]) {
  const prompt = args[promptFlagIndex + 1];
  await orchestrate(prompt);
  process.exit(0);
}

// İnteraktif mod
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Banner
const banner = await getModelBannerText();

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║     🤖 MCPAgent — My Project AI Orchestrator                 ║');
console.log('║     ⚙️  Antigravity-Native Runtime                       ║');
console.log('║                                                          ║');
console.log('║  Projeler: frontend | backend | baileys                  ║');
console.log('║            root     | meta                               ║');
console.log('║                                                          ║');
console.log('║  Komutlar:                                               ║');
console.log('║    exit                → Çık                             ║');
console.log('║    projects            → Proje listesi                   ║');
console.log('║    logs                → Son görev logları               ║');
console.log('║    model               → Aktif modelleri göster          ║');
console.log('║    model list          → Tüm modeller + seçici           ║');
console.log('║    model add           → Yeni model ekle (interaktif)    ║');
console.log('║    model add <isim>    → Hızlı model ekle                ║');
console.log('║    model remove <n>    → Model kaldır                    ║');
console.log('║    model sync groq    → Groq modelleri keşfet (canlı)    ║');
console.log('║    model set planner <n> → Planner modelini değiştir     ║');
console.log('║    model set executor <n>→ Executor modelini değiştir    ║');
console.log('║    model set both <n>  → Her ikisini değiştir            ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`   🧠 Planner:  ${banner.plannerText}`);
console.log(`   ⚡ Executor: ${banner.executorText}`);
console.log('');

async function handleSpecialCommands(input) {
  if (input === 'projects') {
    const { readFile } = await import('fs/promises');
    const content = await readFile('./projects.json', 'utf-8');
    const projects = JSON.parse(content);
    console.log('\n📁 Projeler:');
    for (const [key, val] of Object.entries(projects)) {
      console.log(`   • ${key.padEnd(10)} → ${val.path} (${val.type})`);
    }
    console.log('');
    return true;
  }

  if (input === 'logs') {
    const { getRecentLogs } = await import('./src/memory/taskLog.js');
    const logs = await getRecentLogs(5);
    if (logs.length === 0) {
      console.log('\n📜 Henüz log kaydı yok.\n');
    } else {
      console.log('\n📜 Son görevler:');
      for (const log of logs) {
        const status = log.summary.fail === 0 ? '✅' : '⚠️';
        console.log(`   ${status} [${log.timestamp}] "${log.prompt.substring(0, 50)}..." (${log.summary.success}/${log.summary.total})`);
      }
      console.log('');
    }
    return true;
  }

  // Model komutları — delegasyon
  if (input === 'model' || input === 'models' || input.startsWith('model ')) {
    return await handleModelCommand(input, rl);
  }

  return false;
}

function ask() {
  rl.question('📝 Görev > ', async (input) => {
    const trimmed = input.trim();

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('\n👋 Görüşürüz!\n');
      rl.close();
      return;
    }

    if (!trimmed) {
      ask();
      return;
    }

    const handled = await handleSpecialCommands(trimmed);
    if (!handled) {
      await orchestrate(trimmed);
    }

    ask();
  });
}

ask();
