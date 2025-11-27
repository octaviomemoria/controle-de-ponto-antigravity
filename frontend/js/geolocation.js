// ============================================================================
// MÓDULO DE GEOLOCALIZAÇÃO
// ============================================================================

class Geolocalizacao {
    /**
     * Obter coordenadas atuais
     */
    static async obter() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalização não suportada'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        precisao: position.coords.accuracy
                    });
                },
                (error) => {
                    let mensagem = 'Erro ao obter localização';

                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            mensagem = 'Permissão de localização negada';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            mensagem = 'Localização indisponível';
                            break;
                        case error.TIMEOUT:
                            mensagem = 'Tempo esgotado ao obter localização';
                            break;
                    }

                    reject(new Error(mensagem));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    /**
     * Formatar coordenadas para exibição
     */
    static formatar(lat, lon) {
        const latStr = lat.toFixed(6);
        const lonStr = lon.toFixed(6);
        return `${latStr}, ${lonStr}`;
    }
}

window.Geolocalizacao = Geolocalizacao;
