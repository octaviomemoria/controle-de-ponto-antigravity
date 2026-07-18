import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatSlaRemainingLabel,
  getApprovalSlaState
} from "../lib/approvalSla";
import { appendAuditLog } from "../lib/audit";
import { useAuth } from "../lib/auth";
import {
  appendCertificate,
  loadCertificates,
  readCachedCertificates,
  uploadCertificateFile,
  type CertificateRecord
} from "../lib/certificatesRepo";
import { isDateRangeInClosedPeriod } from "../lib/periodLock";
import { isUuid } from "../lib/profileRepo";
import { appendTimeEntry } from "../lib/timeEntriesRepo";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
type CertificateFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function getFileKind(file: File): "image" | "pdf" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return null;
}

function getAttachmentKind(cert: CertificateRecord): "image" | "pdf" | null {
  const name = cert.fileName?.toLowerCase() ?? "";
  const url = cert.fileUrl?.toLowerCase() ?? "";
  if (name.endsWith(".pdf") || url.includes(".pdf")) return "pdf";
  if (name || url) return "image";
  return null;
}

export default function CertificatesPage() {
  const navigate = useNavigate();
  const { user, supabaseEnabled } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("Doenca");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "pdf" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<CertificateFilter>("ALL");
  const [previewImage, setPreviewImage] = useState<{ url: string; title?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [certificates, setCertificates] = useState<CertificateRecord[]>(() =>
    readCachedCertificates()
  );

  useEffect(() => {
    let active = true;

    const refreshFromCache = () => {
      setCertificates(readCachedCertificates(user?.id));
    };

    const refresh = async () => {
      refreshFromCache();
      const synced = await loadCertificates(user?.id);
      if (!active) return;
      setCertificates(synced);
    };

    const handleFocus = () => {
      void refresh();
    };

    refreshFromCache();
    void refresh();
    window.addEventListener("storage", refreshFromCache);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshFromCache);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user?.id]);

  const filteredCertificates = useMemo(() => {
    if (filter === "ALL") return certificates;
    return certificates.filter((cert) => cert.status === filter);
  }, [certificates, filter]);

  const selectedRangeLocked = (() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return isDateRangeInClosedPeriod(start, end);
  })();

  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  };

  const calculateDaysRange = (start: string, end: string) => {
    const startDateValue = new Date(start);
    const endDateValue = new Date(end);
    const diffTime = Math.abs(endDateValue.getTime() - startDateValue.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  };

  const clearSelectedFile = () => {
    setFile(null);
    setFileKind(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      const kind = getFileKind(selectedFile);

      if (!kind) {
        clearSelectedFile();
        setFormError("Formato invalido. Envie JPG, PNG ou PDF.");
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        clearSelectedFile();
        setFormError("Arquivo maior que 5MB. Envie um arquivo menor.");
        return;
      }

      setFile(selectedFile);
      setFileKind(kind);
      if (kind === "pdf") {
        setPreviewUrl(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviewUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!user) return;
    if (!file && !description.trim()) {
      setFormError("Anexe uma foto/PDF ou descreva o motivo.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setFormError("A data final nao pode ser anterior a data inicial.");
      return;
    }
    if (selectedRangeLocked) {
      setFormError("Periodo fechado. Nao e possivel enviar atestado para este intervalo.");
      return;
    }
    if (file && !fileKind) {
      setFormError("Arquivo invalido. Selecione o comprovante novamente.");
      return;
    }

    setIsSubmitting(true);

    let uploadedFilePath: string | undefined;
    let uploadedFileUrl: string | undefined;

    if (file && supabaseEnabled && isUuid(user.id)) {
      try {
        const uploadResult = await uploadCertificateFile(user.id, file);
        if (uploadResult) {
          uploadedFilePath = uploadResult.filePath;
          uploadedFileUrl = uploadResult.fileUrl;
        }
      } catch (error) {
        console.warn("Falha no upload remoto do atestado. Salvando localmente.", error);
      }
    }

    const newCert: CertificateRecord = {
      id: `${Date.now()}`,
      userId: user.id,
      startDate,
      endDate,
      reason,
      description,
      fileUrl: fileKind === "image" ? previewUrl ?? undefined : undefined,
      filePath: uploadedFilePath,
      fileName: file?.name,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    if (uploadedFileUrl) {
      newCert.fileUrl = uploadedFileUrl;
    } else if (file && fileKind === "pdf") {
      newCert.fileUrl = URL.createObjectURL(file);
    }

    const persistedCertificate = await appendCertificate(newCert);
    const refreshedCertificates = await loadCertificates(user.id);
    setCertificates(refreshedCertificates);

    await appendTimeEntry({
      id: `cert-${persistedCertificate.id}`,
      userId: user.id,
      type: "CERTIFICATE",
      timestamp: new Date().toISOString(),
      startDate,
      endDate,
      description: `${reason} - ${description}`.trim(),
      photoUrl: fileKind === "image" ? previewUrl ?? undefined : undefined,
      location: "Envio digital",
      status: "PENDING"
    });

    appendAuditLog({
      actorId: user.id,
      action: "certificate_submitted",
      entityType: "certificate",
      entityId: persistedCertificate.id,
      payload: {
        startDate,
        endDate,
        reason,
        fileType: fileKind ?? "none"
      }
    });

    clearSelectedFile();
    setDescription("");
    setReason("Doenca");
    setStartDate(new Date().toISOString().split("T")[0]);
    setEndDate(new Date().toISOString().split("T")[0]);
    setFormSuccess("Atestado enviado com sucesso.");
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <div className="flex items-center px-4 py-3 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          data-testid="certificates-back-button"
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-900 dark:text-white">
            arrow_back
          </span>
        </button>
        <h1 className="ml-2 text-lg font-bold text-slate-900 dark:text-white">
          Enviar Atestado
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-4 flex flex-col gap-6 max-w-lg mx-auto w-full" data-testid="certificates-form">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              data-testid="certificates-start-date-input"
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              data-testid="certificates-end-date-input"
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">date_range</span>
          <p className="text-sm text-primary font-bold">
            Duracao do atestado: {calculateDays()} dia(s)
          </p>
        </div>
        {selectedRangeLocked && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            O intervalo selecionado esta em periodo fechado.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Motivo</label>
          <div className="relative">
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-testid="certificates-reason-select"
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none transition-all"
            >
              <option>Doenca</option>
              <option>Consulta Medica</option>
              <option>Exames</option>
              <option>Acompanhamento Familiar</option>
              <option>Doacao de Sangue</option>
              <option>Outros</option>
            </select>
            <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              expand_more
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Comprovante (Foto/PDF)
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            data-testid="certificates-file-input"
            className="hidden"
          />

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              data-testid="certificates-upload-trigger"
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors bg-white dark:bg-slate-800"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-2xl">cloud_upload</span>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-primary">Toque para enviar</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG ou PDF (Max 5MB)</p>
              </div>
            </div>
          ) : fileKind === "image" && previewUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black group">
              <img src={previewUrl} alt="Preview" className="w-full h-48 object-contain opacity-90" />
              <button
                type="button"
                onClick={clearSelectedFile}
                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-red-500 transition-colors backdrop-blur-sm"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-white text-xs truncate">
                {file.name}
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="flex h-28 items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4">
                <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                  <span className="material-symbols-outlined">picture_as_pdf</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Arquivo PDF selecionado</p>
                  <p className="text-xs text-slate-500 truncate">{file.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="absolute top-2 right-2 bg-slate-800 text-white p-1.5 rounded-full hover:bg-red-500 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}
          {formError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400" data-testid="certificates-form-error">{formError}</p>
          )}
          {formSuccess && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400" data-testid="certificates-form-success">
              {formSuccess}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Observacoes (Opcional)
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Descreva detalhes adicionais se necessario..."
            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none transition-all"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || selectedRangeLocked}
          data-testid="certificates-submit-button"
          className="mt-auto w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">send</span>
              <span>Enviar Atestado</span>
            </>
          )}
        </button>
      </form>

      <div className="px-4 pb-8 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase">Meus atestados</h2>
            <p className="text-[11px] font-semibold text-slate-400">Certificates list</p>
          </div>
          {certificates.length > 0 && (
            <span className="text-xs font-semibold text-slate-400">
              {certificates.length} registro(s)
            </span>
          )}
        </div>
        <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span>Atestado</span>
          <span>Status</span>
        </div>
        <div className="mb-3 flex gap-2">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as CertificateFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              data-testid={`certificates-filter-${status.toLowerCase()}`}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                filter === status
                  ? "bg-primary text-white shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {status === "ALL"
                ? "Todos"
                : status === "PENDING"
                  ? "Pendentes"
                  : status === "APPROVED"
                    ? "Aprovados"
                    : "Rejeitados"}
            </button>
          ))}
        </div>
        <div className="space-y-3" data-testid="certificates-list">
          {filteredCertificates.length > 0 ? (
            filteredCertificates.map((cert) => {
              const attachmentKind = getAttachmentKind(cert);
              return (
                <div key={cert.id} className="rounded-2xl bg-white dark:bg-slate-800 px-4 py-3 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {cert.reason} - {calculateDaysRange(cert.startDate, cert.endDate)} dia(s)
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    cert.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : cert.status === "APPROVED"
                        ? "bg-green-100 text-green-700"
                        : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {cert.status === "PENDING"
                    ? "Pendente"
                    : cert.status === "APPROVED"
                      ? "Aprovado"
                      : "Recusado"}
                </span>
              </div>
              {cert.description && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {cert.description}
                </p>
              )}
              {cert.status === "PENDING" && (
                <p
                  className={`mt-2 text-[11px] font-semibold ${
                    getApprovalSlaState(cert.slaDueAt) === "OVERDUE"
                      ? "text-rose-600"
                      : getApprovalSlaState(cert.slaDueAt) === "DUE_SOON"
                        ? "text-amber-700"
                        : "text-blue-600"
                  }`}
                >
                  {formatSlaRemainingLabel(cert.slaDueAt)}
                </p>
              )}
              {cert.status !== "PENDING" && cert.reviewNote && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Observacao: {cert.reviewNote}
                </p>
              )}
              {attachmentKind && cert.fileUrl && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    <span className="truncate">
                      {cert.fileName ?? (attachmentKind === "pdf" ? "Comprovante PDF" : "Comprovante")}
                    </span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {attachmentKind === "pdf" ? "PDF" : "IMG"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (attachmentKind === "pdf") {
                          window.open(cert.fileUrl!, "_blank");
                          return;
                        }
                        setPreviewImage({ url: cert.fileUrl!, title: cert.fileName });
                      }}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {attachmentKind === "pdf" ? "Abrir PDF" : "Ver imagem"}
                    </button>
                    <a
                      href={cert.fileUrl}
                      download
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      Baixar
                    </a>
                  </div>
                </div>
              )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
              <p>
                {certificates.length === 0
                  ? "Nenhum atestado enviado."
                  : "Nenhum atestado neste filtro."}
              </p>
            </div>
          )}
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {previewImage.title ?? "Comprovante"}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <img src={previewImage.url} alt="Comprovante" className="w-full max-h-[60vh] object-contain bg-black/90" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
