# MCPAgent — My Project AI Orchestrator

MCPAgent, "My Project" çatısı altındaki birden fazla projeyi tek bir merkezden yönetmek, görevlendirmek ve AI agent'ları (özellikle Antigravity) ile entegre çalışmak için tasarlanmış **AI Orkestrasyon CLI aracıdır** ve **MCP (Model Context Protocol) sunucusudur**.

## 🌟 Özellikler

*   **Çoklu Proje Yönetimi**: Tek bir prompt ile `frontend`, `backend`, `baileys`, `root`, ve `meta` projelerini analiz eder ve görevleri ilgili dizinlere yönlendirir.
*   **Dual-Model Mimarisi**: 
    *   **Planner**: Gelen isteği analiz eder, hangi projelerin etkileneceğini belirler ve bir plan oluşturur.
    *   **Executor (Antigravity Agent)**: Planner'ın oluşturduğu planı alıp doğrudan ilgili projelerde kodlama ve uygulama işlemlerini gerçekleştirir.
*   **Dinamik Model Yönetimi**: CLI veya MCP üzerinden kullanmak istediğiniz Planner ve Executor modellerini dinamik olarak değiştirebilir, silebilir veya yeni modeller (Örn: Groq modelleri) keşfedip ekleyebilirsiniz.
*   **İnteraktif ve Headless CLI Modu**: Hem etkileşimli bir terminal arayüzü sunar, hem de CI/CD süreçlerinde veya tek seferlik komutlarda kullanılabilmesi için headless olarak çalıştırılabilir.
*   **IDE Entegrasyonu (MCP Server)**: Desteklenen IDE'lerde agent'ların proje metadatasını, modelleri ve logları kullanabilmesini sağlayan Model Context Protocol entegrasyonu mevcuttur.

---

## 🚀 Kurulum

1. Repoyu klonlayın ve dizine gidin:
    ```bash
    cd MCPAgent
    ```
2. Bağımlılıkları yükleyin:
    ```bash
    npm install
    ```
3. Çevresel değişkenleri ayarlayın:
    Proje ana dizininde bulunan `.env` dosyasını kendi yapılandırmanıza göre doldurun.

---

## 💻 Kullanım (CLI)

MCPAgent'i kullanmanın farklı yolları vardır:

### 1. İnteraktif Mod
Etkileşimli bir arayüz başlatır.
```bash
npm start
# veya
node cli.js
```

**İnteraktif Komutlar:**
*   `projects`: Yapılandırılmış My Project projelerinin listesini gösterir.
*   `logs`: Son çalıştırılan orkestrasyon görevlerinin loglarını listeler.
*   `model`: Aktif olan Planner ve Executor modellerini gösterir.
*   `model list`: Sistemdeki tüm modelleri listeler.
*   `model add`: Yeni bir modeli sisteme interaktif veya hızlı olarak ekler.
*   `model sync groq`: Groq API üzerinden yeni modelleri keşfeder.
*   `model set planner <n>` / `model set executor <n>`: Modelleri değiştirir.
*   `exit`: Araçtan çıkar.

### 2. Headless Mod
Tek seferlik görev vermek için `-p` bayrağını kullanabilirsiniz.
```bash
node cli.js -p "Yeni bir login sayfası oluştur"
```

### 3. Model Listeleme
Hızlıca kullanılabilir modelleri listelemek için:
```bash
node cli.js --model-list
```

---

## 🔌 MCP Sunucusu (IDE Entegrasyonu)

IDE veya diğer MCP istemcileri (örn. Claude Desktop) için sunucuyu başlatmak isterseniz:
```bash
npm run mcp
```

### MCP Araçları (Tools)
Sunucu başlatıldığında istemcilere aşağıdaki araçlar sunulur:
*   `orchestrate_my_project`: Doğal dille verilen görevi analiz edip planlar.
*   `my-project_project_task`: Belirli bir projeye doğrudan görev atar.
*   `list_my-project_projects`: Tüm kayıtlı projeleri detaylarıyla listeler.
*   `classify_prompt`: Prompt'un hangi projelere ait olduğunu sınıflandırır.
*   `get_project_info`: Proje bağlamı hakkında spesifik bilgi döner.
*   `get_recent_logs`: Önceki görevlerin sonuçlarını ve loglarını döner.
*   `list_models`: Planner ve Executor için sistemde kayıtlı modelleri döner.
*   `switch_model`: Aktif kullanılan LLM modellerini değiştirir.
*   `register_model` & `remove_model`: Yeni modelleri sisteme tanıtır veya siler.

---

## 📁 Proje Yapısı

\`projects.json\` dosyası orkestratörün hangi dizinlere etki edeceğini belirler. Mevcut yapı:

| Proje | Tür | Dizin |
| :--- | :--- | :--- |
| **frontend** | React | `D:/My Project/client` |
| **backend** | Node | `D:/my-project-api-v2` |
| **baileys** | Node | `D:/WhatsappBaileys/backend` |
| **root** | React | `D:/WhatsappBaileys/frontend` |
| **meta** | PHP | `D:/Crm-Meta` |

*(Dizin yolları geliştirme ortamına göre güncellenebilir)*

---

## 🛠️ Teknolojiler
*   **Node.js** (ES Modules)
*   **@modelcontextprotocol/sdk** (MCP entegrasyonu için)
*   **Zod** (Şema validasyonları için)
*   **Dotenv** (Çevresel değişken yönetimi)

## MCP Sunucusu (Model Context Protocol Server)
*This repository functions as a Model Context Protocol (MCP) Server and a CLI-based AI Agent Orchestrator.*

*Bu depo, Model Bağlam Protokolü (MCP) Sunucusu ve CLI tabanlı Yapay Zeka Ajanı Orkestratörü olarak işlev görmektedir.*