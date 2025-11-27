// ============================================================================
// MÓDULO DE CÂMERA - CAPTURA DE FOTOS
// ============================================================================

class Camera {
    constructor() {
        this.stream = null;
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.fotoCapturada = document.getElementById('fotoCapturada');
    }

    /**
     * Iniciar câmera
     */
    async iniciar() {
        try {
            // Solicitar acesso à câmera
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user', // Câmera frontal
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.video.srcObject = this.stream;
            this.video.classList.remove('hidden');
            this.fotoCapturada.classList.add('hidden');

            return true;

        } catch (error) {
            console.error('Erro ao acessar câmera:', error);

            if (error.name === 'NotAllowedError') {
                throw new Error('Permissão para câmera negada');
            } else if (error.name === 'NotFoundError') {
                throw new Error('Câmera não encontrada');
            } else {
                throw new Error('Erro ao acessar câmera');
            }
        }
    }

    /**
     * Capturar foto
     */
    capturar() {
        if (!this.stream) {
            throw new Error('Câmera não iniciada');
        }

        // Configurar canvas com dimensões do vídeo
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        // Desenhar frame atual do vídeo no canvas
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        // Converter canvas para base64
        const fotoBase64 = this.canvas.toDataURL('image/jpeg', 0.8);

        // Mostrar foto capturada
        this.fotoCapturada.src = fotoBase64;
        this.fotoCapturada.classList.remove('hidden');
        this.video.classList.add('hidden');

        return fotoBase64;
    }

    /**
     * Parar câmera e liberar recursos
     */
    parar() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.video.srcObject = null;
        this.video.classList.add('hidden');
        this.fotoCapturada.classList.add('hidden');
    }

    /**
     * Resetar para capturar nova foto
     */
    resetar() {
        this.video.classList.remove('hidden');
        this.fotoCapturada.classList.add('hidden');
    }
}

window.Camera = Camera;
