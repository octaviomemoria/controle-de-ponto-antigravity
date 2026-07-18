# Mobile e Web Strategy

## Objetivo
Definir como o produto deve operar em:
- Web administrativa
- Android
- iOS

## Recomendacao
### Web
Uso exclusivo para:
- `ADMIN`
- `OWNER`

### Mobile
Uso principal para:
- colaborador
- lideranca operacional

### Base tecnica recomendada
- manter `apps/web` como base de UI compartilhada
- empacotar o canal mobile com `Capacitor`
- manter `apps/api` e `supabase` como backend unico

## Motivo da recomendacao
- evita manter dois apps nativos separados
- reaproveita a base React existente
- preserva o acesso web administrativo
- permite distribuir Android e iOS com a mesma camada de negocio

## Ponto importante de dominio
O projeto agora possui o papel `OWNER` formalmente implementado como equivalente a `SUPER_ADMIN`.

Papeis atuais relevantes:
- `EMPLOYEE`
- `LEADER`
- `MANAGER`
- `OWNER` (equivalente a SUPER_ADMIN)
- `SUPER_ADMIN` (mantido para backward compatibility)

Implementacao:
- OWNER existe no enum schema
- Funcao is_owner() retorna true para OWNER ou SUPER_ADMIN
- RLS, API e frontend reconhecem ambos como admin

## Estrategia de acesso por canal
### Web
- foco em gestao
- cadastro de colaborador
- configuracoes da empresa
- auditoria
- gestao multiempresa

### Android e iOS
- login
- registro de ponto
- upload de atestado
- consulta de historico
- notificacoes operacionais

## Itens tecnicos obrigatorios antes do mobile
1. Escolher `Capacitor` como shell mobile.
2. Criar projeto mobile no monorepo.
3. Configurar camera e geolocalizacao.
4. Revisar armazenamento local e offline.
5. Validar iOS especificamente:
   - permissões
   - comportamento de PWA versus app empacotado
   - fluxo de upload

## Conclusao
Com o requisito de Android + iOS + web administrativa, o caminho mais coerente e:
- web para `ADMIN` e `OWNER`
- mobile multiplataforma para operacao diaria
- backend e Supabase compartilhados
