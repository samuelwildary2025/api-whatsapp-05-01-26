# Whatsmeow Service

Microserviço Go para conexão com WhatsApp usando a biblioteca [whatsmeow](https://github.com/tulir/whatsmeow).

## Requisitos

- Go 1.21+
- SQLite (para armazenamento de sessões)

## Desenvolvimento Local

```bash
cd whatsmeow

# Baixar dependências
go mod download

# Rodar em desenvolvimento
go run .

# Build para produção
CGO_ENABLED=1 go build -o whatsmeow-server .
```

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `WHATSMEOW_PORT` | 8081 | Porta do servidor HTTP |
| `WHATSMEOW_DATA_DIR` | ./data | Diretório para banco SQLite |

## Endpoints

### Instâncias

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/instance/:id/connect` | Conectar instância |
| POST | `/instance/:id/disconnect` | Desconectar |
| POST | `/instance/:id/logout` | Fazer logout |
| GET | `/instance/:id/status` | Status da conexão |
| GET | `/instance/:id/qr` | Obter QR Code |

### Mensagens

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/message/text` | Enviar texto |
| POST | `/message/media` | Enviar mídia |
| POST | `/message/location` | Enviar localização |

### WebSocket

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/ws/:instanceId` | WebSocket para eventos |

## Eventos WebSocket

O WebSocket emite os seguintes eventos:

- `qr` - QR Code gerado
- `ready` - Conectado com sucesso
- `disconnected` - Desconectado
- `logged_out` - Sessão encerrada
- `message` - Nova mensagem recebida
- `message_ack` - Confirmação de entrega

## Exemplo de uso

```bash
# Conectar instância
curl -X POST http://localhost:8081/instance/minha-instancia/connect

# Enviar mensagem
curl -X POST http://localhost:8081/message/text \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "minha-instancia",
    "to": "5511999999999",
    "text": "Olá!"
  }'
```

## Docker

```bash
# Build
docker build -t whatsmeow-service .

# Run
docker run -p 8081:8081 -v whatsmeow_data:/app/data whatsmeow-service
```
