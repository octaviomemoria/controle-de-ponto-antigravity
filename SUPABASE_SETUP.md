# Guia de Configuração do Supabase

Este guia detalha todos os passos necessários para configurar o Supabase para o sistema de controle de ponto.

## 1. Criar Projeto

1. Acesse https://supabase.com
2. Faça login ou crie uma conta
3. Clique em "New Project"
4. Preencha:
   - **Name**: Controle de Ponto
   - **Database Password**: (crie uma senha forte)
   - **Region**: Brazil Southeast (ou mais próximo)
5. Aguarde a criação do projeto (2-3 minutos)

## 2. Executar Schema SQL

1. No painel do Supabase, clique em "SQL Editor" no menu lateral
2. Clique em "New Query"
3. Abra o arquivo `backend/supabase_schema.sql`
4. Copie todo o conteúdo
5. Cole no SQL Editor do Supabase
6. Clique em "Run" ou pressione Ctrl+Enter

### O que foi criado:
- ✅ 3 tabelas: `empresas`, `perfis`, `registros_ponto`
- ✅ Políticas RLS para cada tabela
- ✅ Bucket de storage `fotos-ponto`
- ✅ Funções auxiliares
- ✅ Views para relatórios
- ✅ Dados de demonstração (1 empresa)

## 3. Verificar Tabelas

1. Clique em "Table Editor" no menu lateral
2. Você deve ver 3 tabelas:
   - `empresas` - Cadastro de empresas
   - `perfis` - Usuários do sistema
   - `registros_ponto` - Registros de ponto

## 4. Configurar Storage

1. Clique em "Storage" no menu lateral
2. Verifique se existe o bucket `fotos-ponto`
3. Se não existir, crie:
   - Clique em "New bucket"
   - Nome: `fotos-ponto`
   - Marque "Public bucket"
   - Clique em "Create bucket"

## 5. Configurar Autenticação

### Habilitar Email Provider

1. Clique em "Authentication" no menu lateral
2. Vá em "Providers"
3. Clique em "Email"
4. Configurações recomendadas para desenvolvimento:
   - **Enable Email provider**: ✅ Ativado
   - **Confirm email**: ❌ Desativado (para facilitar testes)
   - **Enable Email Signup**: ✅ Ativado
5. Clique em "Save"

### Configurar URL de Redirecionamento

1. Em "Authentication" > "URL Configuration"
2. Adicione URLs permitidas:
   ```
   http://localhost:8080
   http://127.0.0.1:8080
   ```

## 6. Obter Credenciais

1. Clique em "Settings" (ícone de engrenagem) no menu lateral
2. Vá em "API"
3. **Copie e guarde** as seguintes informações:

### Project URL
```
https://seuprojeto.supabase.co
```

### API Keys

**anon public** (para frontend):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**service_role** (para backend - MANTER SECRETO):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 7. Configurar .env do Backend

Abra o arquivo `backend/.env` e preencha:

```env
SUPABASE_URL=https://seuprojeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon-publica-aqui
SUPABASE_SERVICE_KEY=sua-chave-service-role-aqui

API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True

ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

## 8. Configurar config.js do Frontend

Abra `frontend/js/config.js` e ajuste se necessário:

```javascript
const CONFIG = {
    API_URL: 'http://localhost:8000',
    // ...
};
```

## 9. Criar Primeira Empresa

A empresa de demonstração já foi criada pelo script SQL.

Para criar outra empresa:

1. Vá em "Table Editor" > "empresas"
2. Clique em "Insert" > "Insert row"
3. Preencha:
   - **id**: (gerado automaticamente)
   - **nome**: Nome da Empresa
   - **configuracoes**: 
     ```json
     {
       "jornada_diaria_horas": 8,
       "tolerancia_atraso_minutos": 10
     }
     ```
   - **ativa**: true
4. Clique em "Save"

## 10. Criar Primeiro Usuário Super Admin

### Método 1: Pelo Painel do Supabase

1. Vá em "Authentication" > "Users"
2. Clique em "Add user" > "Create new user"
3. Preencha:
   - **Email**: admin@empresa.com
   - **Password**: senha123 (ou sua senha)
   - **Auto Confirm User**: ✅ Ativado
4. Clique em "Create user"
5. **Copie o User UID** que aparece
6. Vá em "Table Editor" > "perfis"
7. Clique em "Insert" > "Insert row"
8. Preencha:
   - **id**: (cole o User UID copiado)
   - **empresa_id**: 00000000-0000-0000-0000-000000000001
   - **email**: admin@empresa.com
   - **nome_completo**: Administrador do Sistema
   - **funcao**: super_admin
   - **codigo_funcionario**: null
9. Clique em "Save"

### Método 2: Via SQL (mais rápido)

1. Vá em "SQL Editor"
2. Execute:

```sql
-- Primeiro, crie o usuário no Auth (substitua email e senha)
-- Nota: Você precisa fazer isso pelo painel ou API, não por SQL

-- Depois, crie o perfil (substitua o ID pelo UID do usuário criado)
INSERT INTO perfis (id, empresa_id, email, nome_completo, funcao)
VALUES (
    'cole-aqui-o-user-uid',
    '00000000-0000-0000-0000-000000000001',
    'admin@empresa.com',
    'Administrador do Sistema',
    'super_admin'
);
```

## 11. Verificar RLS (Row Level Security)

As políticas RLS garantem isolamento dos dados.

Para verificar:

1. Vá em "Authentication" > "Policies"
2. Selecione a tabela `registros_ponto`
3. Você deve ver políticas como:
   - "Funcionário vê próprios registros"
   - "Company admin vê registros da empresa"
   - "Super admin vê todos registros"

## 12. Testar Conexão

### Teste 1: Backend

```bash
cd backend
python -m uvicorn app.main:app --reload
```

Acesse: http://localhost:8000
Deve retornar: `{"nome": "API de Controle de Ponto", ...}`

Acesse: http://localhost:8000/docs
Deve mostrar a documentação Swagger da API

### Teste 2: Frontend

```bash
cd frontend
python -m http.server 8080
```

Acesse: http://localhost:8080
Deve mostrar a tela de login

### Teste 3: Login

1. Faça login com o usuário super admin criado
2. O sistema deve:
   - Autenticar com sucesso
   - Mostrar a tela principal
   - Exibir o nome do usuário
   - Mostrar opção de "Administração" no menu (apenas para admins)

## 13. Troubleshooting

### Erro: "Invalid API key"
- Verifique se copiou as chaves corretas do Supabase
- Confirme que não há espaços extras no .env

### Erro: "Table not found"
- Execute o schema SQL novamente
- Verifique se executou TODO o conteúdo do arquivo

### Erro: "Permission denied"
- Verifique se as políticas RLS foram criadas
- Confirme que o usuário tem um perfil na tabela `perfis`

### Erro 401 no login
- Verifique se o email provider está habilitado
- Confirme que o usuário existe em Authentication > Users

### Fotos não aparecem
- Verifique se o bucket `fotos-ponto` existe e é público
- Confirme as permissões do bucket

## 14. Produção

Para ambiente de produção:

1. **Nunca exponha** a `service_role` key no frontend
2. Use variáveis de ambiente para as keys
3. Ative **Confirm Email** em Authentication
4. Configure **Custom SMTP** para emails
5. Adicione domínio à **URL Configuration**
6. Ative **Rate Limiting**
7. Monitore uso em "Settings" > "Billing"

## 15. Backup

O Supabase faz backup automático, mas você pode:

1. Exportar dados: "Table Editor" > Selecionar tabela > "..." > "Export as CSV"
2. Backup do SQL: Copiar o schema do SQL Editor
3. Point-in-time recovery: Disponível em planos pagos

---

✅ Configuração completa do Supabase!

Agora você pode executar o backend e frontend conforme o README principal.
