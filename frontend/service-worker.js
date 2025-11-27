// ============================================================================
// SERVICE WORKER - PWA Offline Support
// ============================================================================

const CACHE_VERSION = 'controle-ponto-v1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

// Arquivos para cache inicial
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/main.css',
    '/css/ponto.css',
    '/js/config.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/camera.js',
    '/js/geolocation.js',
    '/js/offline.js',
    '/js/ponto.js',
    '/js/ui.js',
    '/js/app.js',
    '/manifest.json'
];

// ============================================================================
// INSTALL - Cachear arquivos estáticos
// ============================================================================

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando...');

    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => {
                console.log('[Service Worker] Cacheando arquivos estáticos');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================================================
// ACTIVATE - Limpar caches antigos
// ============================================================================

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Ativando...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('controle-ponto-') && name !== CACHE_STATIC && name !== CACHE_DYNAMIC)
                        .map(name => {
                            console.log('[Service Worker] Deletando cache antigo:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================================================
// FETCH - Estratégia de cache
// ============================================================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requisições não-HTTP
    if (!request.url.startsWith('http')) {
        return;
    }

    // Estratégia: Cache First para arquivos estáticos
    if (STATIC_FILES.includes(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Estratégia: Network First para chamadas à API
    if (request.url.includes('/api/') || request.url.includes(':8000')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Estratégia: Cache First para imagens e assets
    if (request.destination === 'image' || request.destination === 'font') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Padrão: Network First
    event.respondWith(networkFirst(request));
});

// ============================================================================
// ESTRATÉGIAS DE CACHE
// ============================================================================

/**
 * Cache First - Busca no cache primeiro, depois na rede
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);

    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);

        if (response.ok) {
            const cache = await caches.open(CACHE_DYNAMIC);
            cache.put(request, response.clone());
        }

        return response;

    } catch (error) {
        console.error('[Service Worker] Erro ao buscar:', request.url);

        // Retornar página offline se disponível
        return caches.match('/offline.html') || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Network First - Busca na rede primeiro, depois no cache
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);

        if (response.ok) {
            const cache = await caches.open(CACHE_DYNAMIC);
            cache.put(request, response.clone());
        }

        return response;

    } catch (error) {
        console.log('[Service Worker] Rede indisponível, buscando no cache');

        const cached = await caches.match(request);

        if (cached) {
            return cached;
        }

        // Se não encontrou no cache, retornar erro
        return new Response(JSON.stringify({
            error: 'Offline',
            message: 'Você está offline e este conteúdo não está disponível no cache'
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ============================================================================
// SYNC - Background Sync (para sincronizar quando voltar online)
// ============================================================================

self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync:', event.tag);

    if (event.tag === 'sync-registros') {
        event.waitUntil(syncRegistros());
    }
});

/**
 * Sincronizar registros offline
 */
async function syncRegistros() {
    try {
        console.log('[Service Worker] Sincronizando registros offline...');

        // Aqui você poderia chamar a API diretamente ou notificar o app
        // Por simplicidade, vamos apenas logar

        // Em produção, você abriria o IndexedDB, pegaria os registros
        // não sincronizados e os enviaria para a API

    } catch (error) {
        console.error('[Service Worker] Erro na sincronização:', error);
        throw error; // Reagendar sync
    }
}

// ============================================================================
// PUSH NOTIFICATIONS - Suporte para notificações (futuro)
// ============================================================================

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push recebido:', event.data?.text());

    const data = event.data?.json() || {};
    const title = data.title || 'Controle de Ponto';
    const options = {
        body: data.body || 'Nova notificação',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: data
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notificação clicada');

    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});
