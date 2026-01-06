# WhatsApp API

API WhatsApp não-oficial com painel administrativo. Permite gerenciar múltiplas instâncias, enviar mensagens, gerenciar grupos, campanhas em massa e muito mais.

## 🚀 Quick Start

### 1. Pré-requisitos

- Node.js 18+
- PostgreSQL
- Redis
- Docker (opcional)

### 2. Instalação

```bash
# Clonar o projeto
cd "api whatsapp"

# Instalar dependências
npm install

# Copiar arquivo de ambiente
cp .env.example .env

# Editar o .env com suas configurações
```

### 3. Configurar Banco de Dados

**Opção A: Com Docker (recomendado)**

```bash
# Subir PostgreSQL e Redis
docker-compose up -d postgres redis

# Rodar migrations
npm run db:push
```

**Opção B: Sem Docker**

Configure as variáveis `DATABASE_URL` e `REDIS_URL` no `.env` para seus servidores locais.

```bash
# Rodar migrations
npm run db:push
```

### 4. Rodar o Servidor

```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm run build
npm start
```

O servidor estará rodando em `http://localhost:3000`

---

## 📖 Uso da API

### Autenticação

#### Registrar usuário
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "123456"}'
```

#### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "123456"}'
```

Guarde o `token` retornado para usar nas próximas requisições.

---

### Gerenciar Instâncias

#### Criar instância
```bash
curl -X POST http://localhost:3000/admin/instance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"name": "Minha Instância"}'
```

Guarde o `token` da instância para enviar mensagens.

#### Listar instâncias
```bash
curl http://localhost:3000/admin/instances \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

### Conectar ao WhatsApp

#### Conectar (gera QR Code)
```bash
curl -X POST http://localhost:3000/instance/INSTANCE_ID/connect \
  -H "Authorization: Bearer SEU_TOKEN"
```

#### Ver QR Code
```bash
curl http://localhost:3000/instance/INSTANCE_ID/qr \
  -H "Authorization: Bearer SEU_TOKEN"
```

O QR Code é retornado em base64. Use para escanear com WhatsApp.

#### Verificar status
```bash
curl http://localhost:3000/instance/INSTANCE_ID/status \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

### Enviar Mensagens

Use o **token da instância** (X-Instance-Token) para enviar mensagens.

#### Enviar texto
```bash
curl -X POST http://localhost:3000/message/text \
  -H "Content-Type: application/json" \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA" \
  -d '{
    "to": "5511999999999",
    "text": "Olá! Esta é uma mensagem de teste."
  }'
```

#### Enviar imagem
```bash
curl -X POST http://localhost:3000/message/media \
  -H "Content-Type: application/json" \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA" \
  -d '{
    "to": "5511999999999",
    "mediaUrl": "https://example.com/image.jpg",
    "caption": "Veja esta imagem!"
  }'
```

#### Enviar localização
```bash
curl -X POST http://localhost:3000/message/location \
  -H "Content-Type: application/json" \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA" \
  -d '{
    "to": "5511999999999",
    "latitude": -23.5505,
    "longitude": -46.6333,
    "description": "São Paulo, SP"
  }'
```

---

### Grupos

#### Criar grupo
```bash
curl -X POST http://localhost:3000/group/create \
  -H "Content-Type: application/json" \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA" \
  -d '{
    "name": "Meu Grupo",
    "participants": ["5511999999999", "5511888888888"]
  }'
```

#### Listar grupos
```bash
curl http://localhost:3000/groups \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA"
```

---

### Campanhas em Massa

#### Criar campanha simples
```bash
curl -X POST http://localhost:3000/campaign/simple \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "name": "Black Friday",
    "instanceId": "INSTANCE_ID",
    "message": {
      "type": "text",
      "text": "🔥 Promoção Black Friday! 50% OFF"
    },
    "recipients": ["5511999999999", "5511888888888"],
    "delay": 5000
  }'
```

#### Iniciar campanha
```bash
curl -X POST http://localhost:3000/campaign/CAMPAIGN_ID/start \
  -H "Authorization: Bearer SEU_TOKEN"
```

#### Pausar campanha
```bash
curl -X POST http://localhost:3000/campaign/CAMPAIGN_ID/control \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"action": "pause"}'
```

---

### Webhooks

Configure webhooks para receber eventos em tempo real.

#### Configurar webhook da instância
```bash
curl -X POST http://localhost:3000/instance/INSTANCE_ID/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "webhookUrl": "https://seu-servidor.com/webhook",
    "webhookEvents": ["message", "message_ack"]
  }'
```

#### Server-Sent Events (SSE)
```bash
curl http://localhost:3000/sse/INSTANCE_ID \
  -H "X-Instance-Token: TOKEN_DA_INSTANCIA"
```

---

## 📚 Endpoints Disponíveis

### Autenticação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /auth/register | Registrar usuário |
| POST | /auth/login | Login |
| GET | /auth/me | Info do usuário atual |

### Administração
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /admin/instance | Criar instância |
| GET | /admin/instances | Listar instâncias |
| GET | /admin/instance/:id | Detalhes da instância |
| POST | /admin/instance/:id/update | Atualizar instância |
| DELETE | /admin/instance/:id | Deletar instância |
| GET | /admin/webhook | Ver webhook global |
| POST | /admin/webhook | Configurar webhook global |
| GET | /admin/stats | Estatísticas do sistema |

### Instância
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /instance/:id/connect | Conectar ao WhatsApp |
| POST | /instance/:id/disconnect | Desconectar |
| POST | /instance/:id/logout | Logout (remove sessão) |
| GET | /instance/:id/status | Status da conexão |
| GET | /instance/:id/qr | QR Code |
| GET | /instance/:id/qr/stream | QR Code via SSE |

### Mensagens
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /message/text | Enviar texto |
| POST | /message/media | Enviar mídia |
| POST | /message/location | Enviar localização |
| POST | /message/contact | Enviar contato |
| POST | /message/react | Reagir a mensagem |
| POST | /message/delete | Deletar mensagem |
| POST | /message/search | Buscar mensagens |

### Contatos
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /contacts | Listar contatos |
| POST | /contacts/list | Listar com paginação |
| POST | /contacts/details | Detalhes do contato |
| POST | /contacts/verify | Verificar números |
| POST | /contacts/block | Bloquear |
| POST | /contacts/unblock | Desbloquear |
| GET | /contacts/blocked | Listar bloqueados |

### Grupos
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /group/create | Criar grupo |
| POST | /group/info | Info do grupo |
| GET | /groups | Listar grupos |
| POST | /group/participants/add | Adicionar participantes |
| POST | /group/participants/remove | Remover participantes |
| POST | /group/leave | Sair do grupo |
| POST | /group/invite-code | Obter link de convite |

### Chats
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /chats | Listar chats |
| POST | /chats/search | Buscar chats |
| POST | /chat/archive | Arquivar |
| POST | /chat/pin | Fixar |
| POST | /chat/mute | Silenciar |
| POST | /chat/delete | Deletar |

### Campanhas
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /campaigns | Listar campanhas |
| POST | /campaign/simple | Criar campanha simples |
| POST | /campaign/advanced | Criar campanha avançada |
| POST | /campaign/:id/start | Iniciar campanha |
| POST | /campaign/:id/control | Pausar/Retomar/Cancelar |
| DELETE | /campaign/:id | Deletar campanha |

---

## 🔧 Estrutura do Projeto

```
src/
├── config/
│   └── env.ts           # Variáveis de ambiente
├── lib/
│   ├── prisma.ts        # Cliente Prisma
│   ├── redis.ts         # Cliente Redis
│   ├── logger.ts        # Logger Pino
│   └── whatsapp.ts      # Gerenciador WhatsApp
├── middlewares/
│   ├── auth.ts          # Autenticação JWT
│   └── error.ts         # Handler de erros
├── modules/
│   ├── auth/            # Autenticação
│   ├── admin/           # Administração
│   ├── instance/        # Instâncias
│   ├── messages/        # Mensagens
│   ├── contacts/        # Contatos
│   ├── groups/          # Grupos
│   ├── chats/           # Chats
│   ├── profile/         # Perfil
│   ├── campaigns/       # Campanhas
│   └── webhooks/        # Webhooks
└── server.ts            # Entry point
```

---

## ⚠️ Avisos Importantes

1. **Uso não-oficial**: Esta API usa engenharia reversa do WhatsApp Web. Não é endossada pelo WhatsApp/Meta.

2. **Risco de ban**: O uso excessivo (spam, muitas mensagens) pode resultar em banimento da conta.

3. **WhatsApp Business**: Recomendamos usar contas WhatsApp Business para maior estabilidade.

4. **Recursos**: Cada instância consome ~300-500MB de RAM devido ao Chromium.

---

## 📄 Licença

ISC
