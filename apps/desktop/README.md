# Desktop

Aplicativo Electron para Windows, reutilizando o build React/PWA.

```powershell
npm install
npm run build:web
npm run start -w @controle/desktop
```

Gerar instalador NSIS e executável portátil:

```powershell
npm run dist -w @controle/desktop
```

Antes de distribuir, configure `apps/web/.env` com Supabase real e
`VITE_ENABLE_DEMO_MODE=false`, então gere novamente o pacote.
