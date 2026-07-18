import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveCompanyInfoForUser } from "../lib/companiesRepo";

type SuccessEntry = {
  id: string;
  userId: string;
  type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
  timestamp: string;
  location: string;
  coordinates?: { lat: number; lng: number };
  photoUrl?: string;
  status: "PENDING" | "SYNCED";
  hash?: string;
  deviceInfo?: string;
  source?: string;
};

export default function SuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { entry, isOffline, label } = (location.state as {
    entry?: SuccessEntry;
    isOffline?: boolean;
    label?: string;
  }) || { entry: undefined, isOffline: false, label: "" };
  const [companyInfo, setCompanyInfo] = useState<{ name: string | null; logoUrl?: string | null } | null>(null);

  useEffect(() => {
    if (!entry) {
      navigate("/home", { replace: true });
    }
  }, [entry, navigate]);

  useEffect(() => {
    if (!entry?.userId) return;
    let active = true;
    void resolveCompanyInfoForUser(entry.userId).then((info) => {
      if (!active) return;
      setCompanyInfo(info);
    });
    return () => {
      active = false;
    };
  }, [entry?.userId]);

  if (!entry) return null;

  const timestamp = new Date(entry.timestamp);
  const formattedTime = timestamp.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const formattedDate = timestamp.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark pb-24">
      <div className="flex items-center p-4 min-h-[64px] justify-between shrink-0">
        <button
          onClick={() => navigate("/ponto")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Novo Registro"
        >
          <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl">
            add_a_photo
          </span>
        </button>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] text-center">
          Confirmacao
        </h2>
        <button
          onClick={() => navigate("/home")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Inicio"
        >
          <span className="material-symbols-outlined text-slate-900 dark:text-white text-2xl">home</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 w-full max-w-md mx-auto">
        <div className="flex flex-col items-center gap-6 w-full animate-pop-in">
          <div className="relative">
            <div className="h-40 w-40 rounded-full bg-slate-200 dark:bg-slate-800 p-1 shadow-lg ring-4 ring-white dark:ring-slate-700 overflow-hidden relative">
              {entry.photoUrl ? (
                <img src={entry.photoUrl} alt="Punch" className="w-full h-full object-cover transform scale-x-[-1]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-[60px]">face</span>
                </div>
              )}
              <div
                className={`absolute inset-0 flex items-center justify-center backdrop-blur-[1px] ${
                  isOffline ? "bg-amber-500/20" : "bg-primary/20"
                }`}
              >
                <span className="material-symbols-outlined text-white text-[60px] drop-shadow-lg">
                  {isOffline ? "save" : "check_circle"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center gap-2">
            <h1 className="text-slate-900 dark:text-white text-[26px] font-bold leading-tight tracking-tight">
              {isOffline ? "Salvo Offline" : label || "Registro Confirmado!"}
            </h1>
            <p className="text-[#4c739a] dark:text-slate-400 text-lg font-medium leading-normal">
              {formattedTime} • {formattedDate}
            </p>
            {entry.coordinates && (
              <p className="text-xs text-slate-400 font-mono mt-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                Lat: {entry.coordinates.lat.toFixed(5)} • Lng: {entry.coordinates.lng.toFixed(5)}
              </p>
            )}
            {entry.location && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                <p className="font-semibold text-slate-700 dark:text-slate-200">Local do registro</p>
                <p className="mt-1">{entry.location}</p>
                {companyInfo?.name && (
                  <div className="mt-2 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    {companyInfo.logoUrl ? (
                      <img
                        src={companyInfo.logoUrl}
                        alt="Logo da empresa"
                        className="h-6 w-6 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-base">apartment</span>
                    )}
                    <span>Empresa: {companyInfo.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center w-full animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div
            className={`flex h-10 items-center justify-center gap-x-2 rounded-lg px-4 py-2 transition-colors ${
              isOffline ? "bg-amber-50 dark:bg-amber-900/20" : "bg-[#e7edf3] dark:bg-slate-800"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] ${isOffline ? "text-amber-500" : "text-primary"}`}
            >
              {isOffline ? "sync_disabled" : "cloud_done"}
            </span>
            <p
              className={`text-sm font-semibold leading-normal ${
                isOffline ? "text-amber-700 dark:text-amber-400" : "text-slate-900 dark:text-slate-200"
              }`}
            >
              {isOffline ? "Sincronizacao Pendente" : "Sincronizado com RH"}
            </p>
          </div>
        </div>

        {entry.hash && (
          <div className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 mt-2">
            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1 tracking-wider text-center">
              Hash de Integridade Digital (Portaria 671)
            </p>
            <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all text-center leading-tight">
              {entry.hash}
            </p>
          </div>
        )}
      </div>

      <div
        className="w-full mt-auto p-4 pb-8 flex flex-col gap-3 max-w-md mx-auto shrink-0 animate-fade-in"
        style={{ animationDelay: "0.35s" }}
      >
        <button
          onClick={() => navigate("/home")}
          className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] hover:bg-blue-600 active:scale-[0.98] transition-all shadow-md shadow-blue-500/20 dark:shadow-none"
        >
          <span className="truncate">Voltar ao Inicio</span>
        </button>

        <button
          onClick={() => navigate("/historico")}
          className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-transparent text-slate-900 dark:text-slate-300 text-sm font-bold leading-normal tracking-[0.015em] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <span className="truncate">Ver Comprovante</span>
        </button>
      </div>
    </div>
  );
}
