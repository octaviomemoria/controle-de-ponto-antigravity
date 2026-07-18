# Runbook de Producao

## Objetivo
Padronizar deploy, validacao, rollback e resposta inicial a incidente para os ambientes `staging` e `production`.

## Pre-requisitos
- deploy Vercel associado a um commit imutavel
- variaveis de ambiente configuradas no provedor
- projeto Supabase do ambiente provisionado
- migration mais recente aplicada
- buckets criados:
  - `company-logos`
  - `employee-photos`
  - `certificates`
  - `punch-photos`

## Deploy em staging
1. Confirmar que o PR esta verde no CI.
2. Confirmar que o Preview Vercel aponta para o commit esperado.
3. Homologar a URL de Preview.
4. Confirmar rollout no provedor.
5. Validar:
   - `/api/health`
   - `/api/ready`
   - login
   - registro de ponto
   - upload de arquivo
   - cadastro de colaborador

## Promocao para producao
1. Confirmar homologacao do mesmo commit em `staging`.
2. Confirmar secrets e dominios de producao.
3. Confirmar backup recente e plano de rollback.
4. Fazer merge do commit homologado em `main`.
5. Confirmar o deploy Production na Vercel.
6. Validar:
   - `/api/health`
   - `/api/ready`
   - login
   - fluxo administrativo minimo
   - upload em Storage

## Rollback
### Quando executar
- `/api/ready` falhando apos deploy
- erro generalizado de login
- regressao critica em upload/ponto/cadastro
- aumento relevante de 5xx

### Procedimento
1. Identificar o ultimo deployment estavel.
2. Usar o rollback da Vercel para promovê-lo.
3. Confirmar volta de:
   - `/api/health`
   - `/api/ready`
4. Revalidar login e operacao basica.
5. Registrar:
   - commit ruim
   - horario
   - sintomas
   - acao tomada

## Incidente inicial
### Sintoma: API indisponivel
1. Verificar logs do container.
2. Verificar `/api/health`.
3. Verificar `/api/ready`.
4. Confirmar envs:
   - `APP_URL`
   - `CORS_ALLOWED_ORIGINS`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Se necessario, rollback.

### Sintoma: login falhando
1. Verificar Supabase Auth do ambiente.
2. Validar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Verificar se `APP_URL` bate com o dominio do ambiente.
4. Testar fluxo de convite/reset.

### Sintoma: upload falhando
1. Verificar buckets no Supabase.
2. Verificar policies de Storage.
3. Verificar se o path segue `companyId/userId/...`.
4. Verificar logs da API e console do navegador.

## Checklist de encerramento de incidente
- causa imediata identificada
- rollback ou correcao aplicada
- ambiente estavel
- evidencias registradas
- proximo fix encaminhado

## Artefatos relacionados
- `DOCUMENTACAO_PRODUCAO_2026-05-19.md`
- `DEPLOY_STAGING.md`
- `ENVIRONMENTS.md`
- `supabase/README.md`
- `supabase/migrations/20260322_001_production_hardening.sql`
- `supabase/migrations/20260519_001_owner_equivalence_hardening.sql`
