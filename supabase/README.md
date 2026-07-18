# Supabase

## Estrutura
- `schema.sql`: bootstrap completo do schema base.
- `rls.sql`: policies consolidadas para uma instalacao nova.
- `migrations/`: mudancas incrementais para ambientes ja existentes.

## Fluxo recomendado
### Ambiente novo
1. Aplicar `schema.sql`.
2. Aplicar `rls.sql`.

### Ambiente existente
1. Aplicar os arquivos em `migrations/` em ordem lexicografica.
2. Validar auth, RLS e Storage em staging antes de promover para producao.

Migration mais recente de hardening:
- `migrations/20260519_001_owner_equivalence_hardening.sql`

## Observacao
As migrations em `migrations/` sao o caminho recomendado daqui para frente para evolucoes incrementais.
