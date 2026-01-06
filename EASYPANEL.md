# Configuração para EasyPanel

## Deploy Automático

O EasyPanel pode fazer deploy direto do seu repositório GitHub.

## Serviços Necessários

### 1. PostgreSQL (Database)
- Use o template PostgreSQL do EasyPanel
- Configure as variáveis:
  - `POSTGRES_USER`: postgres
  - `POSTGRES_PASSWORD`: sua_senha_segura
  - `POSTGRES_DB`: whatsapp_api

### 2. Redis (Cache/Filas)
- Use o template Redis do EasyPanel
- Configuração padrão funciona

### 3. API Backend (App)
- **Source**: GitHub - samuelwildary2025/apiwhats
- **Build Command**: `npm install && npm run db:generate && npm run build`
- **Start Command**: `npm start`
- **Port**: 3000

#### Variáveis de Ambiente:
```
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DATABASE_URL=postgresql://postgres:sua_senha@postgres:5432/whatsapp_api
REDIS_URL=redis://redis:6379
JWT_SECRET=sua_chave_jwt_super_secreta_com_pelo_menos_32_caracteres
JWT_EXPIRES_IN=7d
ADMIN_TOKEN=seu_token_admin_seguro_16_chars
LOG_LEVEL=info
WA_SESSION_PATH=./sessions
WA_MAX_INSTANCES=10
```

### 4. Frontend (Opcional)
- **Source**: GitHub - samuelwildary2025/apiwhats (subpath: /frontend)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Port**: 3000

#### Variáveis de Ambiente:
```
NEXT_PUBLIC_API_URL=https://sua-api.dominio.com
```

## Persistência de Sessões

As sessões do WhatsApp são armazenadas automaticamente no banco de dados PostgreSQL.
**Não é necessário configurar volumes persistentes** para as sessões.

As instâncias permanecerão conectadas após deploys/restarts automaticamente.

## Healthcheck

A API tem endpoint de health:
- `GET /health`

## Domínios

Configure os domínios no EasyPanel:
- API: `api.seudominio.com` → porta 3000 do backend
- Painel: `painel.seudominio.com` → porta 3000 do frontend
