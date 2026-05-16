/**
 * MCP Server — Antigravity IDE Entegrasyonu v3
 *
 * Antigravity'nin kendi modelleri (Claude, Gemini, GPT) executor olarak kullanılır.
 * Planner: Keyword classifier (API key gerektirmez)
 * Executor: Antigravity Agent (MCP üzerinden)
 *
 * Yeni özellikler:
 * - Model discovery tool
 * - Aktif model bilgisi resource
 * - Model değiştirme tool
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyProjects } from '../planner/projectClassifier.js';
import { getRecentLogs } from '../memory/taskLog.js';
import { PROJECT_CONTEXT } from '../prompts/systemPrompts.js';
import { getAvailableModels, getModelsByProvider, findModel, registerModel, removeModel, generateModelId } from '../models/modelRegistry.js';
import { getModelInfoForMCP } from '../mcp/mcpBridge.js';
import { switchModel } from '../models/modelConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_FILE = join(__dirname, '..', '..', 'projects.json');

async function loadProjects() {
  const content = await readFile(PROJECTS_FILE, 'utf-8');
  return JSON.parse(content);
}

const server = new McpServer({
  name: 'my-project-orchestrator',
  version: '3.0.0',
});

// ═══════════════════════════════════════════════════════════
// TOOL 1: ANA ORKESTRASYON
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'orchestrate_my_project',
  {
    title: 'My Project Görev Orkestrasyonu',
    description: `My Project projelerinde görev yönetimi. Prompt'u analiz eder, etkilenen projeleri belirler, görev planı döner. Dönen planı SEN (Antigravity) çalıştıracaksın.

5 My Project Projesi: frontend (React), backend (Node.js API), baileys (WhatsApp), root (Yönetim paneli), meta (PHP webhook)`,
    inputSchema: z.object({
      prompt: z.string().describe('Kullanıcının doğal dil talebi'),
    }),
  },
  async ({ prompt }) => {
    const projects = await loadProjects();
    const suggestedProjects = classifyProjects(prompt);
    const targetProjects = suggestedProjects.length > 0
      ? suggestedProjects
      : Object.keys(projects);

    // Aktif model bilgilerini ekle
    const modelInfo = await getModelInfoForMCP();

    const tasks = targetProjects.map((key, idx) => {
      const proj = projects[key];
      const context = PROJECT_CONTEXT[key] || '';
      return { order: idx + 1, project: key, path: proj.path, type: proj.type, context, task: prompt };
    });

    const taskList = tasks.map(t =>
      `### Görev ${t.order}: [${t.project}] (${t.type})
📁 Dizin: ${t.path}
📝 Görev: ${t.task}
${t.context ? `\n🔧 Proje Bağlamı:\n${t.context}` : ''}`
    ).join('\n\n---\n\n');

    const result = `# 🤖 My Project Orkestrasyon Planı

**Prompt:** ${prompt}
**Etkilenen projeler:** ${targetProjects.join(', ')}
**Toplam görev:** ${tasks.length}

## 🤖 Aktif Modeller
- **Planner:** ${modelInfo.planner.name} (${modelInfo.planner.provider})
- **Executor:** ${modelInfo.executor.name} (${modelInfo.executor.provider})

---

${taskList}

---

## ⚡ Yürütme Talimatı
Yukarıdaki görevleri sırayla uygula:
1. Her görev için belirtilen **dizine** git
2. Görev açıklamasını o projede uygula
3. Mevcut kodu bozmadan çalış
4. Her görevin sonucunu raporla`;

    return { content: [{ type: 'text', text: result }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 2: TEK PROJE GÖREV
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'my-project_project_task',
  {
    title: 'My Project Proje Görevi',
    description: 'Belirli bir My Project projesinde görev çalıştırmak için proje bağlamını döner.',
    inputSchema: z.object({
      project: z.enum(['frontend', 'backend', 'baileys', 'root', 'meta']).describe('Proje adı'),
      task: z.string().describe('Yapılacak görev açıklaması'),
    }),
  },
  async ({ project, task }) => {
    const projects = await loadProjects();
    const proj = projects[project];

    if (!proj) {
      return { content: [{ type: 'text', text: `❌ Proje bulunamadı: ${project}` }] };
    }

    const context = PROJECT_CONTEXT[project] || '';

    const result = `# 🎯 Proje Görevi: ${project}

**Dizin:** ${proj.path}
**Teknoloji:** ${proj.type}
**Görev:** ${task}

${context ? `## Proje Bağlamı\n${context}` : ''}

## ⚡ Yürütme
1. **${proj.path}** dizinine git
2. Yukarıdaki görevi uygula
3. Mevcut kodu bozmadan çalış`;

    return { content: [{ type: 'text', text: result }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 3: Proje listesi
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'list_my-project_projects',
  {
    title: 'My Project Projelerini Listele',
    description: 'Tüm My Project projelerini, yollarını ve teknolojilerini listeler',
    inputSchema: z.object({}),
  },
  async () => {
    const projects = await loadProjects();
    const list = Object.entries(projects)
      .map(([key, val]) => `• **${key}**: ${val.path} (${val.type})`)
      .join('\n');
    return { content: [{ type: 'text', text: `# My Project Projeleri\n\n${list}` }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 4: Prompt sınıflandır
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'classify_prompt',
  {
    title: 'Prompt Sınıflandır',
    description: 'Verilen prompt hangi My Project projelerini etkiler belirler',
    inputSchema: z.object({
      prompt: z.string().describe('Analiz edilecek prompt'),
    }),
  },
  async ({ prompt }) => {
    const result = classifyProjects(prompt);
    const projects = await loadProjects();

    if (result.length === 0) {
      return { content: [{ type: 'text', text: 'Belirli bir proje tespit edilemedi. Tüm projeler etkilenebilir.' }] };
    }

    const details = result.map(key => {
      const p = projects[key];
      return `• **${key}**: ${p?.path} (${p?.type})`;
    }).join('\n');

    return { content: [{ type: 'text', text: `Etkilenen projeler:\n${details}` }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 5: Proje detay bilgisi
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'get_project_info',
  {
    title: 'Proje Bilgisi',
    description: 'Belirli bir My Project projesinin detaylı bilgisini döner',
    inputSchema: z.object({
      project: z.enum(['frontend', 'backend', 'baileys', 'root', 'meta']).describe('Proje adı'),
    }),
  },
  async ({ project }) => {
    const projects = await loadProjects();
    const info = projects[project];
    if (!info) return { content: [{ type: 'text', text: `Proje bulunamadı: ${project}` }] };

    const context = PROJECT_CONTEXT[project] || 'Ek bağlam yok.';
    return {
      content: [{
        type: 'text',
        text: `# ${project}\n\n**Yol:** ${info.path}\n**Teknoloji:** ${info.type}\n\n## Bağlam\n${context}`,
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 6: Son loglar
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'get_recent_logs',
  {
    title: 'Son Görev Logları',
    description: 'Son orkestrasyon görevlerinin loglarını döner',
    inputSchema: z.object({
      count: z.number().optional().describe('Kayıt sayısı (varsayılan 5)'),
    }),
  },
  async ({ count }) => {
    const logs = await getRecentLogs(count || 5);
    if (logs.length === 0) {
      return { content: [{ type: 'text', text: 'Henüz log kaydı yok.' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 7: 🆕 Model Listesi
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'list_models',
  {
    title: 'Kullanılabilir Modelleri Listele',
    description: 'Antigravity üzerinden erişilebilen tüm modelleri, aktif model bilgileriyle birlikte döner.',
    inputSchema: z.object({}),
  },
  async () => {
    const models = await getAvailableModels();
    const modelInfo = await getModelInfoForMCP();
    const grouped = await getModelsByProvider();

    let text = '# 🤖 Kullanılabilir Modeller\n\n';
    text += `**Aktif Planner:** ${modelInfo.planner.name} (${modelInfo.planner.provider})\n`;
    text += `**Aktif Executor:** ${modelInfo.executor.name} (${modelInfo.executor.provider})\n\n`;

    for (const [provider, provModels] of Object.entries(grouped)) {
      text += `## ${provider.toUpperCase()}\n`;
      for (const m of provModels) {
        const roles = [];
        if (m.id === modelInfo.planner.id) roles.push('planner');
        if (m.id === modelInfo.executor.id) roles.push('executor');
        const tag = roles.length > 0 ? ` ← **${roles.join(', ')}**` : '';
        text += `- **${m.name}** (id: \`${m.id}\`, tier: ${m.tier}, speed: ${m.speed})${tag}\n`;
      }
      text += '\n';
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 8: 🆕 Model Değiştir
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'switch_model',
  {
    title: 'Model Değiştir',
    description: 'Planner veya Executor modelini değiştirir. Model ID için list_models aracını kullanarak mevcut modelleri görüntüleyin.',
    inputSchema: z.object({
      role: z.enum(['planner', 'executor']).describe('Değiştirilecek rol'),
      model_id: z.string().describe('Yeni model ID (örn: claude-opus-4.6-thinking)'),
    }),
  },
  async ({ role, model_id }) => {
    const model = await findModel(model_id);
    if (!model) {
      const all = await getAvailableModels();
      const ids = all.map(m => `\`${m.id}\``).join(', ');
      return {
        content: [{
          type: 'text',
          text: `❌ Model bulunamadı: \`${model_id}\`\n\nGeçerli model ID'leri: ${ids}`,
        }],
      };
    }

    const success = await switchModel(role, model_id);
    if (success) {
      const roleLabel = role === 'planner' ? '🧠 Planner' : '⚡ Executor';
      return {
        content: [{
          type: 'text',
          text: `✅ ${roleLabel} modeli değiştirildi: **${model.name}** (${model.provider})`,
        }],
      };
    }

    return { content: [{ type: 'text', text: '❌ Model değiştirme başarısız.' }] };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 9: 🆕 Model Kaydet
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'register_model',
  {
    title: 'Yeni Model Kaydet',
    description: 'Yeni bir modeli registry\'ye ekler. Antigravity\'de yeni model gördüğünde bu tool ile kaydedebilirsin.',
    inputSchema: z.object({
      name: z.string().describe('Model adı (örn: Gemini 4 Ultra)'),
      provider: z.string().describe('Provider (google, anthropic, openai-oss)'),
      tier: z.string().optional().describe('Tier (fast, medium, high, thinking, thinking-max)'),
      speed: z.string().optional().describe('Hız (fast, medium, slow)'),
      quality: z.string().optional().describe('Kalite (medium, high, highest)'),
    }),
  },
  async ({ name, provider, tier, speed, quality }) => {
    const id = generateModelId(name);
    const existing = await findModel(id);

    const model = {
      id,
      name,
      provider: provider.toLowerCase(),
      tier: tier || 'medium',
      capabilities: ['code', 'analysis'],
      speed: speed || 'medium',
      quality: quality || 'high',
      recommended_for: ['executor'],
    };

    if (model.tier.includes('thinking')) {
      model.capabilities.push('planning', 'thinking', 'reasoning');
      model.recommended_for.push('planner');
    }

    const result = await registerModel(model);
    const action = result.action === 'added' ? 'eklendi' : 'güncellendi';

    return {
      content: [{
        type: 'text',
        text: `✅ Model ${action}: **${model.name}**\n- ID: \`${model.id}\`\n- Provider: ${model.provider}\n- Tier: ${model.tier}\n- Speed: ${model.speed}\n- Quality: ${model.quality}`,
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════════
// TOOL 10: 🆕 Model Kaldır
// ═══════════════════════════════════════════════════════════
server.registerTool(
  'remove_model',
  {
    title: 'Model Kaldır',
    description: 'Registry\'den bir modeli kaldırır. Aktif modeller kaldırılamaz.',
    inputSchema: z.object({
      model_id: z.string().describe('Kaldırılacak model ID'),
    }),
  },
  async ({ model_id }) => {
    const result = await removeModel(model_id);
    const icon = result.success ? '✅' : '❌';
    return { content: [{ type: 'text', text: `${icon} ${result.message}` }] };
  }
);

// Başlat
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔌 MCP Server v3.1 başlatıldı: my-project-orchestrator');
  console.error('   → Executor: Antigravity Agent (dinamik model)');
  console.error('   → Tool: list_models, switch_model, register_model, remove_model');
}

main().catch(console.error);