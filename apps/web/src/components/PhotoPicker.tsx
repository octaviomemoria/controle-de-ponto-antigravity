import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type PhotoSelection = {
  dataUrl: string;
  file?: File;
};

type PhotoPickerProps = {
  value?: string | null;
  onSelect: (selection: PhotoSelection) => void;
  onRemove?: () => void;
  onError?: (message: string) => void;
  maxSizeBytes?: number;
  title?: string;
  description?: string;
  triggerClassName?: string;
  triggerTitle?: string;
  triggerRef?: RefObject<HTMLButtonElement>;
  children?: React.ReactNode;
};

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

export default function PhotoPicker({
  value,
  onSelect,
  onRemove,
  onError,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  title = "Imagem",
  description = "Escolha como deseja adicionar a imagem.",
  triggerClassName = "",
  triggerTitle,
  triggerRef,
  children
}: PhotoPickerProps) {
  const [showModal, setShowModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamCanvasRef = useRef<HTMLCanvasElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const modalOpenRef = useRef(false);

  useEffect(() => {
    modalOpenRef.current = showModal;
  }, [showModal]);

  useEffect(() => {
    if (!showCameraModal) return;
    const video = webcamVideoRef.current;
    const stream = webcamStreamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setError("Nao foi possivel iniciar a camera.");
    });
  }, [showCameraModal]);

  const stopCameraStream = () => {
    const stream = webcamStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const openModal = () => {
    setError(null);
    setShowModal(true);
    window.setTimeout(() => {
      if (!modalOpenRef.current) {
        uploadInputRef.current?.click();
      }
    }, 200);
  };

  const closeModal = () => {
    setShowModal(false);
    setError(null);
  };

  const closeCameraModal = () => {
    stopCameraStream();
    setShowCameraModal(false);
    setIsOpeningCamera(false);
    setError(null);
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    setError(null);

    if (!selectedFile.type.startsWith("image/")) {
      reportError("Arquivo invalido. Envie uma imagem (JPG ou PNG).");
      return;
    }

    if (selectedFile.size > maxSizeBytes) {
      reportError("Imagem maior que 5MB. Selecione um arquivo menor.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        reportError("Nao foi possivel carregar a imagem selecionada.");
        return;
      }
      onSelect({ dataUrl: result, file: selectedFile });
      setShowModal(false);
    };
    reader.readAsDataURL(selectedFile);
    event.currentTarget.value = "";
  };

  const openCameraCapture = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      reportError("Camera nao suportada neste navegador. Use upload.");
      return;
    }

    setIsOpeningCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false
      });
      webcamStreamRef.current = stream;
      setShowModal(false);
      setShowCameraModal(true);
    } catch {
      reportError("Nao foi possivel acessar a camera. Verifique as permissoes.");
    } finally {
      setIsOpeningCamera(false);
    }
  };

  const handleCaptureFromCamera = () => {
    const video = webcamVideoRef.current;
    const canvas = webcamCanvasRef.current;
    if (!video || !canvas) {
      reportError("Nao foi possivel capturar a foto.");
      return;
    }

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    if (width <= 0 || height <= 0) {
      reportError("Camera ainda inicializando. Aguarde e tente novamente.");
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      reportError("Nao foi possivel processar a imagem.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    if (!imageData) {
      reportError("Falha ao gerar imagem capturada.");
      return;
    }

    onSelect({ dataUrl: imageData });
    closeCameraModal();
  };

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelection}
      />
      <button
        type="button"
        ref={triggerRef}
        onClick={openModal}
        className={triggerClassName}
        title={triggerTitle}
      >
        {children}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => void openCameraCapture()}
                disabled={isOpeningCamera}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                {isOpeningCamera ? "Abrindo camera..." : "Usar camera"}
              </button>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                Fazer upload
              </button>
              {value && onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    setShowModal(false);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  Remover imagem
                </button>
              )}
              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                  {error}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Capturar imagem</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Posicione o rosto e clique em capturar.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-700">
              <video
                ref={webcamVideoRef}
                autoPlay
                playsInline
                muted
                className="h-[320px] w-full object-cover"
              />
              <canvas ref={webcamCanvasRef} className="hidden" />
            </div>
            {error && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCaptureFromCamera}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Capturar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
