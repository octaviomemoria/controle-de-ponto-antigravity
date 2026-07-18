# Produção na VPS

Arquitetura recomendada:

- Caddy: HTTPS e proxy reverso.
- Aplicativo: container local em `127.0.0.1:3002`.
- Supabase oficial via Docker em `127.0.0.1:8000`.
- PostgreSQL e Storage com backup diário e cópia externa.

## Pré-requisitos

- Ubuntu 24.04 LTS, mínimo 4 GB RAM/2 CPUs/40 GB; recomendado 8 GB/4 CPUs/80 GB.
- Portas 22, 80 e 443 liberadas.
- Dois DNS A apontando para a VPS: `ponto.DOMINIO` e `supabase.DOMINIO`.
- Docker, Compose e Caddy instalados.

## Instalação

1. Instalar o Supabase pelo procedimento Docker oficial em
   `/opt/controle-ponto/supabase-project`.
2. Limitar as portas do Supabase no firewall; somente 22, 80 e 443 ficam públicas.
3. Copiar `.env.example` para `.env`, preencher domínios e chaves geradas pelo
   Supabase e proteger com `chmod 600`.
4. Aplicar banco e políticas:

   ```sh
   sh deploy/vps/provision-db.sh
   ```

5. Criar os usuários sem gravar senhas:

   ```sh
   export OWNER_EMAIL='octacm@gmail.com'
   export OWNER_PASSWORD='senha-temporaria'
   export MANAGER_EMAIL='octavio.memoria@gmail.com'
   export MANAGER_PASSWORD='senha-temporaria'
   node scripts/seed-production-users.js
   unset OWNER_PASSWORD MANAGER_PASSWORD
   ```

6. Subir o aplicativo:

   ```sh
   docker compose -f deploy/vps/docker-compose.yml up -d --build
   ```

7. Instalar `Caddyfile.example` como `/etc/caddy/Caddyfile`, fornecer as variáveis
   de domínio ao serviço e recarregar o Caddy.
8. Agendar `backup.sh` diariamente e enviar a cópia para armazenamento externo
   S3/R2. Backup somente no mesmo servidor não protege contra perda da VPS.

## Homologação obrigatória

- Login e redefinição de senha para OWNER, MANAGER, LEADER e EMPLOYEE.
- Isolamento RLS entre duas empresas.
- Upload/leitura/negação nos quatro buckets privados.
- Registro de ponto online/offline, geolocalização, foto e sincronização.
- Restauração real de um backup.
- Alertas de indisponibilidade, CPU, RAM, disco e expiração TLS.

