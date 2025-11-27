# API Documentation - Sistema de Controle de Ponto

Base URL: `http://localhost:8000`

Documentação interativa (Swagger): `http://localhost:8000/docs`

## Autenticação

Todos os endpoints (exceto `/auth/login`) requerem autenticação via Bearer token.

Header: `Authorization: Bearer {token}`

### POST /auth/login
Login no sistema

**Request:**
```json
{
  "email": "usuario@empresa.com",
  "password": "senha123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "company_id": "uuid",
    "email": "usuario@empresa.com",
    "nome_completo": "Nome do Usuário",
    "funcao": "employee",
    "codigo_funcionario": "123"
  }
}
```

### POST /auth/register
Registrar novo usuário (apenas super admin)

### GET /auth/me
Obter dados do usuário autenticado

### POST /auth/logout
Fazer logout

---

## Registro de Ponto

### POST /ponto/registrar
Registrar entrada, saída ou intervalo

**Request:**
```json
{
  "clock_type": "clock_in",  // clock_in, clock_out, break_start, break_end
  "latitude": -23.5505,
  "longitude": -46.6333,
  "photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "usuario_id": "uuid",
  "empresa_id": "uuid",
  "tipo_registro": "clock_in",
  "timestamp": "2025-11-24T10:00:00Z",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "foto_url": "https://...supabase.co/storage/v1/object/public/fotos-ponto/...",
  "criado_em": "2025-11-24T10:00:00Z"
}
```

### GET /ponto/ultimo
Obter último registro do usuário

**Response 200:**
```json
{
  "last_record": {
    "id": "uuid",
    "clock_type": "clock_in",
    "timestamp": "2025-11-24T08:00:00Z",
    ...
  },
  "can_clock_in": false,
  "can_clock_out": true,
  "can_break_start": true,
  "can_break_end": false
}
```

### GET /ponto/meus-registros
Obter registros do próprio usuário

**Query params:**
- `dias`: número de dias para buscar (padrão: 7)

**Response 200:**
```json
[
  {
    "id": "uuid",
    "clock_type": "clock_in",
    "timestamp": "2025-11-24T08:00:00Z",
    "foto_url": "https://...",
    ...
  }
]
```

### POST /ponto/sincronizar
Sincronizar registros offline

**Request:**
```json
{
  "records": [
    {
      "clock_type": "clock_in",
      "latitude": -23.5505,
      "longitude": -46.6333,
      "photo_base64": "..."
    }
  ]
}
```

**Response 200:**
```json
{
  "synced_count": 1,
  "failed_count": 0,
  "errors": []
}
```

---

## Relatórios

### GET /relatorios/espelho-ponto
Obter espelho de ponto

**Query params:**
- `usuario_id`: ID do usuário
- `data_inicio`: Data inicial (ISO 8601)
- `data_fim`: Data final (ISO 8601)

**Response 200:**
```json
{
  "user": { ... },
  "period_start": "2025-11-01T00:00:00Z",
  "period_end": "2025-11-30T23:59:59Z",
  "entries": [
    {
      "date": "2025-11-24",
      "clock_in": "2025-11-24T08:00:00Z",
      "clock_out": "2025-11-24T17:00:00Z",
      "break_duration_minutes": 60,
      "total_hours": 8.0,
      "records": [ ... ]
    }
  ],
  "total_hours": 176.0,
  "total_days": 22
}
```

### GET /relatorios/folha-pagamento
Obter dados para folha (admin)

**Response 200:**
```json
{
  "user": { ... },
  "period_start": "2025-11-01T00:00:00Z",
  "period_end": "2025-11-30T23:59:59Z",
  "regular_hours": 176.0,
  "overtime_hours": 8.0,
  "total_hours": 184.0,
  "days_worked": 22,
  "absences": 0,
  "late_arrivals": 2
}
```

### GET /relatorios/empresa/registros
Obter todos registros da empresa (admin)

### GET /relatorios/empresa/folha/exportar
Exportar folha da empresa (CSV ou JSON)

**Query params:**
- `formato`: "csv" ou "json"
- `data_inicio`: Data inicial
- `data_fim`: Data final

---

## Administração

### GET /admin/empresas
Listar empresas (super admin)

### POST /admin/empresas
Criar empresa (super admin)

**Request:**
```json
{
  "name": "Empresa XYZ",
  "settings": {
    "jornada_diaria_horas": 8,
    "tolerancia_atraso_minutos": 10
  }
}
```

### GET /admin/empresas/{empresa_id}
Obter detalhes de uma empresa

### GET /admin/usuarios
Listar usuários da empresa

### GET /admin/usuarios/{usuario_id}
Obter detalhes de um usuário

### DELETE /admin/usuarios/{usuario_id}
Deletar usuário (super admin)

### GET /admin/estatisticas
Obter estatísticas da empresa

**Response 200:**
```json
{
  "total_usuarios": 25,
  "total_registros_mes": 500,
  "total_registros_hoje": 18,
  "empresa_id": "uuid"
}
```

---

## Códigos de Status

- `200` - OK
- `201` - Created
- `204` - No Content
- `400` - Bad Request (validação falhou)
- `401` - Unauthorized (não autenticado)
- `403` - Forbidden (sem permissão)
- `404` - Not Found
- `500` - Internal Server Error

## Exemplos de Erro

```json
{
  "detail": "Sessão expirada. Faça login novamente"
}
```

```json
{
  "detail": "Você só pode ver seus próprios registros",
  "error_code": "FORBIDDEN"
}
```

---

## Rate Limiting

Não implementado ainda. Recomendado para produção.

## Paginação

Não implementado ainda. Endpoints retornam todos os resultados.
Para produção, adicionar paginação:
- Query params: `page`, `per_page`
- Headers de resposta: `X-Total-Count`, `X-Page`, `X-Per-Page`
