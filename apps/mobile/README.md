# Mobile - Capacitor

## Estado atual

Esta pasta contem apenas o scaffold do container mobile.

- O frontend mobile continua vindo de `apps/web/dist`
- `capacitor.config.ts` ja existe
- o bootstrap nativo compartilhado agora roda a partir de `apps/web/src/lib/mobileBootstrap.ts`
- os projetos nativos `android/` e `ios/` ainda devem ser gerados localmente quando a equipe for iniciar o trabalho nativo

O repositorio ainda nao entrega APK, AAB ou IPA automaticamente.

## Configuracao inicial

Para configurar o projeto mobile pela primeira vez:

```bash
# 1. Na raiz do monorepo, instalar dependencias
npm install

# 2. Gerar o build web consumido pelo container mobile
npm run build:web

# 3. Entrar na pasta mobile
cd apps/mobile

# 4. Gerar o projeto nativo Android uma vez
npx cap add android

# 5. Gerar o projeto nativo iOS uma vez
npx cap add ios

# 6. Sincronizar assets e plugins com os projetos nativos criados
npx cap sync

# 7. Abrir no Android Studio
npx cap open android

# 8. Abrir no Xcode
npx cap open ios
```

## Estrutura

- `src/index.ts` - reexport do bootstrap compartilhado
- `capacitor.config.ts` - configuracao principal do Capacitor
- `android/` - projeto nativo Android, gerado localmente com `npx cap add android`
- `ios/` - projeto nativo iOS, gerado localmente com `npx cap add ios`

## Scripts disponiveis

```bash
# gerar o build web usado pelo shell mobile
npm run build:web

# criar o projeto Android local
npm run setup:android

# criar o projeto iOS local
npm run setup:ios

# sincronizar web assets e plugins
npm run sync

# abrir os projetos nativos existentes
npm run open:android
npm run open:ios
```

## Build nativo

A geracao de APK/AAB/IPA deve ser feita dentro do Android Studio ou do Xcode depois que os projetos nativos tiverem sido criados e sincronizados.

## Permissoes Android

As permissoes basicas sao definidas via plugins/configuracao do Capacitor:
- Camera
- Localizacao (Geolocation)
- Internet
