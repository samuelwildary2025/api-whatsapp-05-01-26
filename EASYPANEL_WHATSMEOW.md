# Deploy no EasyPanel - Versão Whatsmeow

## ⚡ Vantagens da Nova Arquitetura

| Métrica | Versão Antiga (Puppeteer) | Nova Versão (Whatsmeow) |
|---------|---------------------------|-------------------------|
| RAM por instância | ~400MB | ~50MB |
| Imagem Docker | ~1.5GB | ~100MB |
| Tempo de inicialização | ~30s | ~2s |
| Dependência Chromium | ✅ Sim | ❌ Não |

---

## 🏗️ Arquitetura no EasyPanel

Você precisará de **4 serviços**:

```
┌─────────────────────────────────────────────────────┐
│                    EasyPanel                         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Postgres │  │  Redis   │  │    Whatsmeow     │  │
│  │  :5432   │  │  :6379   │  │  (Go) :8081      │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│        │            │                │              │
│        └────────────┼────────────────┘              │
│                     │                               │
│               ┌─────▼─────┐                         │
│               │    API    │ ◄── Porta exposta       │
│               │  (Node)   │     :3000               │
│               │   :3000   │                         │
│               └───────────┘                         │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Passo a Passo

### 1️⃣ Criar Serviço PostgreSQL

1. No EasyPanel, clique em **"New Service"** → **"Template"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `postgres`
   - **POSTGRES_USER**: `postgres`
   - **POSTGRES_PASSWORD**: `sua_senha_segura`
   - **POSTGRES_DB**: `whatsapp_api`

### 2️⃣ Criar Serviço Redis

1. **"New Service"** → **"Template"** → **"Redis"**
2. Configure:
   - **Name**: `redis`
   - Configuração padrão funciona

### 3️⃣ Criar Serviço Whatsmeow (Go)

1. **"New Service"** → **"App"**
2. Configure:
   - **Name**: `whatsmeow`
   - **Source**: GitHub (seu repositório)
   - **Dockerfile Path**: `whatsmeow/Dockerfile`
   - **Port**: `8081`

3. **Variáveis de Ambiente**:
```env
WHATSMEOW_PORT=8081
WHATSMEOW_DATA_DIR=/app/data
```

4. **Volumes** (Persistência de sessões):
   - Source: `whatsmeow-data`
   - Target: `/app/data`

### 4️⃣ Criar Serviço API (Node.js)

1. **"New Service"** → **"App"**
2. Configure:
   - **Name**: `api`
   - **Source**: GitHub (seu repositório)
   - **Dockerfile Path**: `Dockerfile.api`
   - **Port**: `3000`

3. **Variáveis de Ambiente**:
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=postgresql://postgres:sua_senha_segura@postgres:5432/whatsapp_api

# Redis
REDIS_URL=redis://redis:6379

# JWT (mínimo 32 caracteres)
JWT_SECRET=sua_chave_jwt_super_secreta_com_pelo_menos_32_caracteres
JWT_EXPIRES_IN=7d

# Admin (mínimo 16 caracteres)
ADMIN_TOKEN=seu_token_admin_seguro_16_chars

# Whatsmeow Service
WHATSMEOW_URL=http://whatsmeow:8081

# Logs
LOG_LEVEL=info
```

---

## 🔌 Configuração de Rede Interna

No EasyPanel, os serviços se comunicam pelo nome. Certifique-se que:

- API acessa Postgres como: `postgres:5432`
- API acessa Redis como: `redis:6379`
- API acessa Whatsmeow como: `whatsmeow:8081`

---

## 🌐 Domínios

Configure no EasyPanel:
- **API**: `api.seudominio.com` → serviço `api` porta 3000

---

## ✅ Verificação

Após o deploy, teste:

```bash
# Health check da API
curl https://api.seudominio.com/health

# Health check do Whatsmeow
curl https://api.seudominio.com/instance/test/status
```

---

## 🔄 Alternativa: Single Container

Se preferir rodar tudo em um container só, use o `Dockerfile.whatsmeow`:

1. **Dockerfile Path**: `Dockerfile.whatsmeow`
2. Usa **supervisor** para rodar Go + Node.js juntos
3. Mais simples, mas menos escalável

---

## 🐛 Troubleshooting

### Erro de conexão com Whatsmeow

Verifique:
1. Serviço `whatsmeow` está rodando
2. `WHATSMEOW_URL` está correto (`http://whatsmeow:8081`)
3. Os serviços estão na mesma rede

### Erro de build Go

Se o build do Go falhar:
```bash
# O Dockerfile já inclui as dependências, mas se precisar:
apk add --no-cache gcc musl-dev sqlite-dev
```

### Sessões perdidas após restart

Verifique se o volume está configurado:
- Volume `whatsmeow-data` montado em `/app/data`
