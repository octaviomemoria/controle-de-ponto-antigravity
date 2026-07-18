import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PhotoPicker, { type PhotoSelection } from "../components/PhotoPicker";
import { useAuth } from "../lib/auth";
import type { MockEmployee } from "../data/mockEmployees";
import {
  employeeEmailExists,
  listEmployees,
  loadEmployees,
  updateEmployee
} from "../lib/employees";
import {
  loadLeaderAssignments,
  readLeaderAssignment
} from "../lib/leaderAssignmentsRepo";
import {
  DUPLICATE_EMAIL_ERROR,
  fetchProfilePreferences,
  isProfileEmailTaken,
  isUuid,
  updateProfileIdentity,
  updateProfileAvatar,
  updateProfilePreferences
} from "../lib/profileRepo";
import {
  applyThemePreference,
  getProfileStorageKey,
  mergeProfilePreferences,
  persistProfile,
  readProfile,
  type ProfileForm
} from "../lib/profileStorage";
import { dataUrlToBlob, uploadUserFile } from "../lib/storageClient";
import { roleLabel } from "../lib/roles";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const LEAVE_CONFIRM_MESSAGE = "Voce tem alteracoes nao salvas. Deseja sair sem salvar?";

function normalizeProfileForm(data: ProfileForm): ProfileForm {
  return {
    fullName: data.fullName.trim().replace(/\s+/g, " "),
    phone: data.phone.trim(),
    email: data.email.trim().toLowerCase(),
    notificationsEnabled: Boolean(data.notificationsEnabled),
    darkTheme: Boolean(data.darkTheme),
    avatarUrl: data.avatarUrl.trim()
  };
}

function profileFormsMatch(current: ProfileForm, persisted: ProfileForm): boolean {
  const left = normalizeProfileForm(current);
  const right = normalizeProfileForm(persisted);
  return (
    left.fullName === right.fullName &&
    left.phone === right.phone &&
    left.email === right.email &&
    left.notificationsEnabled === right.notificationsEnabled &&
    left.darkTheme === right.darkTheme &&
    left.avatarUrl === right.avatarUrl
  );
}

export default function ProfilePage() {
  const location = useLocation();
  const { user, signOut, supabaseEnabled } = useAuth();
  const profileKey = useMemo(() => getProfileStorageKey(user?.id), [user?.id]);
  const hasRemoteProfileSession =
    supabaseEnabled && user?.mode === "supabase" && isUuid(user?.id);

  const [formData, setFormData] = useState<ProfileForm>(() => readProfile(profileKey, user?.email));
  const [savedSnapshot, setSavedSnapshot] = useState<ProfileForm>(() =>
    normalizeProfileForm(readProfile(profileKey, user?.email))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [leader, setLeader] = useState<MockEmployee | null>(null);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const photoTriggerRef = useRef<HTMLButtonElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const allowNavigationRef = useRef(false);
  const hasUnsavedChanges = useMemo(
    () => !profileFormsMatch(formData, savedSnapshot),
    [formData, savedSnapshot]
  );

  useEffect(() => {
    const next = readProfile(profileKey, user?.email);
    setFormData(next);
    setSavedSnapshot(normalizeProfileForm(next));
    setFormError(null);
    setFormSuccess(null);
  }, [profileKey, user?.email]);

  useEffect(() => {
    allowNavigationRef.current = false;
  }, [location.pathname]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleNavigationClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges || allowNavigationRef.current) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || (!href.startsWith("#/") && !href.startsWith("/"))) return;

      const currentHashPath = `#${location.pathname}`;
      if (href === currentHashPath) return;

      const shouldLeave = window.confirm(LEAVE_CONFIRM_MESSAGE);
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      allowNavigationRef.current = true;
    };

    document.addEventListener("click", handleNavigationClick, true);
    return () => {
      document.removeEventListener("click", handleNavigationClick, true);
    };
  }, [hasUnsavedChanges, location.pathname]);

  useEffect(() => {
    const currentHashPath = `#${location.pathname}`;
    const handleHashChange = () => {
      if (!hasUnsavedChanges || allowNavigationRef.current) return;
      if (window.location.hash === currentHashPath) return;

      const shouldLeave = window.confirm(LEAVE_CONFIRM_MESSAGE);
      if (shouldLeave) {
        allowNavigationRef.current = true;
        return;
      }

      allowNavigationRef.current = true;
      window.location.hash = currentHashPath;
      window.setTimeout(() => {
        allowNavigationRef.current = false;
      }, 0);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [hasUnsavedChanges, location.pathname]);

  useEffect(() => {
    applyThemePreference(formData.darkTheme);
  }, [formData.darkTheme]);

  useEffect(() => {
    const nextPrefs = {
      notificationsEnabled: formData.notificationsEnabled,
      darkTheme: formData.darkTheme
    };
    mergeProfilePreferences(profileKey, user?.email, nextPrefs);
    setSavedSnapshot((prev) =>
      normalizeProfileForm({
        ...prev,
        notificationsEnabled: nextPrefs.notificationsEnabled,
        darkTheme: nextPrefs.darkTheme
      })
    );
    if (hasRemoteProfileSession && user?.id) {
      void updateProfilePreferences(user?.id, {
        notificationsEnabled: nextPrefs.notificationsEnabled,
        themePreference: nextPrefs.darkTheme ? "dark" : "light"
      });
    }
  }, [
    formData.notificationsEnabled,
    formData.darkTheme,
    profileKey,
    hasRemoteProfileSession,
    user?.email,
    user?.id
  ]);

  useEffect(() => {
    if (!hasRemoteProfileSession || !user?.id) return;
    let active = true;
    void fetchProfilePreferences(user.id).then((prefs) => {
      if (!active || !prefs) return;
      setFormData((prev) => ({
        ...prev,
        notificationsEnabled: prefs.notificationsEnabled,
        darkTheme: prefs.themePreference === "dark"
      }));
      setSavedSnapshot((prev) =>
        normalizeProfileForm({
          ...prev,
          notificationsEnabled: prefs.notificationsEnabled,
          darkTheme: prefs.themePreference === "dark"
        })
      );
      mergeProfilePreferences(profileKey, user.email, {
        notificationsEnabled: prefs.notificationsEnabled,
        darkTheme: prefs.themePreference === "dark"
      });
      applyThemePreference(prefs.themePreference === "dark");
    });
    return () => {
      active = false;
    };
  }, [hasRemoteProfileSession, profileKey, user?.email, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const refreshLeader = async () => {
      setLeaderLoading(true);
      await loadEmployees();
      await loadLeaderAssignments(user.id);
      if (!active) return;
      const leaderId = readLeaderAssignment(user.id);
      const found = leaderId ? listEmployees().find((entry) => entry.id === leaderId) ?? null : null;
      setLeader(found);
      setLeaderLoading(false);
    };

    void refreshLeader();
    window.addEventListener("storage", refreshLeader);
    window.addEventListener("focus", refreshLeader);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshLeader);
      window.removeEventListener("focus", refreshLeader);
    };
  }, [user?.id]);

  const updateField = (field: keyof ProfileForm, value: string | boolean) => {
    setFormError(null);
    setFormSuccess(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const persistProfileSnapshot = (next: ProfileForm) => {
    persistProfile(profileKey, next);
    setSavedSnapshot(normalizeProfileForm(next));
  };

  const handleSignOut = async () => {
    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm(LEAVE_CONFIRM_MESSAGE);
      if (!shouldLeave) return;
      allowNavigationRef.current = true;
    }
    await signOut();
  };

  const handleCancelChanges = () => {
    setFormError(null);
    setFormSuccess(null);
    if (!hasUnsavedChanges) return;
    const shouldDiscard = window.confirm("Descartar alteracoes nao salvas?");
    if (!shouldDiscard) return;
    setFormData(savedSnapshot);
    applyThemePreference(savedSnapshot.darkTheme);
  };

  const handleAvatarSelect = async (selection: PhotoSelection) => {
    setFormError(null);
    setFormSuccess(null);

    setFormData((prev) => {
      const next = { ...prev, avatarUrl: selection.dataUrl };
      persistProfileSnapshot(next);
      return next;
    });

    if (!hasRemoteProfileSession || !user?.id) return;

    const blob =
      selection.file ??
      dataUrlToBlob(selection.dataUrl);

    if (!blob) return;

    setIsUploadingAvatar(true);
    try {
      const uploadResult = await uploadUserFile({
        userId: user.id,
        bucket: "employee-photos",
        file: blob,
        fileName: selection.file?.name ?? `avatar-${Date.now()}.jpg`,
        prefix: "avatars",
        contentType: blob.type || "image/jpeg"
      });
      if (!uploadResult) {
        setFormError("Nao foi possivel enviar a imagem. Verifique a configuracao.");
        return;
      }

      const nextUrl = uploadResult.signedUrl ?? selection.dataUrl;
      const updated = await updateProfileAvatar(user.id, uploadResult.path);
      if (!updated) {
        setFormError("Nao foi possivel atualizar o avatar no servidor.");
        return;
      }

      setFormData((prev) => {
        const next = { ...prev, avatarUrl: nextUrl };
        persistProfileSnapshot(next);
        return next;
      });
    } catch {
      setFormError("Nao foi possivel enviar a imagem. Tente novamente.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    setFormError(null);
    setFormSuccess(null);
    setFormData((prev) => {
      const next = { ...prev, avatarUrl: "" };
      persistProfileSnapshot(next);
      return next;
    });

    if (hasRemoteProfileSession && user?.id) {
      await updateProfileAvatar(user.id, null);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const normalizedName = formData.fullName.trim().replace(/\s+/g, " ");
    const normalizedPhone = formData.phone.trim();
    const normalizedEmail = formData.email.trim().toLowerCase();
    if (normalizedName.length < 3) {
      setFormError("Nome invalido. Informe nome e sobrenome.");
      return;
    }
    if (user?.mode !== "demo" && !EMAIL_REGEX.test(normalizedEmail)) {
      setFormError("Email invalido.");
      return;
    }

    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 13)) {
      setFormError("Telefone invalido. Use DDD + numero.");
      return;
    }
    if (employeeEmailExists(normalizedEmail, user?.id)) {
      setFormError(DUPLICATE_EMAIL_ERROR);
      return;
    }

    setIsSaving(true);
    try {
      const normalizedData: ProfileForm = {
        fullName: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
        notificationsEnabled: formData.notificationsEnabled,
        darkTheme: formData.darkTheme,
        avatarUrl: formData.avatarUrl.trim()
      };

      if (hasRemoteProfileSession && user?.id) {
        const duplicateRemote = await isProfileEmailTaken(user.id, normalizedEmail);
        if (duplicateRemote) {
          setFormError(DUPLICATE_EMAIL_ERROR);
          return;
        }

        const remoteResult = await updateProfileIdentity(user.id, {
          name: normalizedName,
          email: normalizedEmail
        });
        if (!remoteResult.ok) {
          setFormError(remoteResult.error ?? "Nao foi possivel salvar os dados do perfil.");
          return;
        }
      }

      persistProfile(profileKey, normalizedData);
      setSavedSnapshot(normalizeProfileForm(normalizedData));
      setFormData(normalizedData);
      if (user?.id) {
        updateEmployee(user.id, {
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          avatar: normalizedData.avatarUrl
        });
      }
      setFormSuccess("Dados salvos com sucesso.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Meu Perfil</p>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Conta</h1>
          </div>
        </div>
        <button
          onClick={() => void handleSignOut()}
          data-testid="profile-signout-button"
          className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Sair
        </button>
      </header>

      <div className="flex-1 p-4 space-y-6">
        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
          <div className="flex items-center gap-4">
            <PhotoPicker
              value={formData.avatarUrl}
              onSelect={handleAvatarSelect}
              onRemove={handleAvatarRemove}
              onError={(message) => setFormError(message)}
              maxSizeBytes={MAX_PHOTO_SIZE_BYTES}
              title="Imagem do perfil"
              description="Escolha como deseja atualizar a imagem."
              triggerClassName="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-md hover:opacity-90 dark:border-slate-700 dark:bg-slate-700"
              triggerTitle="Alterar imagem"
              triggerRef={photoTriggerRef}
            >
              {formData.avatarUrl ? (
                <img src={formData.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sky-400 to-indigo-500"></div>
              )}
            </PhotoPicker>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {user?.email ?? "Usuario"}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {user ? `${roleLabel[user.role]} · ${user.mode}` : "Sem sessao"}
              </p>
              <button
                type="button"
                onClick={() => photoTriggerRef.current?.click()}
                className="mt-1 text-xs font-semibold text-primary hover:underline"
              >
                Alterar imagem
              </button>
              {isUploadingAvatar && (
                <p className="mt-1 text-[11px] text-slate-500">Enviando imagem...</p>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Dados pessoais
            </h3>
            <button
              type="button"
              onClick={() => fullNameInputRef.current?.focus()}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Editar
            </button>
          </div>
          <form className="mt-4 grid gap-4" onSubmit={handleSave} data-testid="profile-form">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              Nome completo
              <input
                ref={fullNameInputRef}
                type="text"
                value={formData.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                data-testid="profile-fullname-input"
                className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              Telefone
              <input
                type="tel"
                value={formData.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                data-testid="profile-phone-input"
                placeholder="(11) 90000-0000"
                className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              E-mail
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField("email", event.target.value)}
                data-testid="profile-email-input"
                className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
              />
            </label>
            {formError && (
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400" data-testid="profile-form-error">{formError}</p>
            )}
            {formSuccess && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400" data-testid="profile-form-success">
                {formSuccess}
              </p>
            )}
            <button
              type="submit"
              disabled={isSaving}
              data-testid="profile-save-button"
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Salvar alteracoes"}
            </button>
            <button
              type="button"
              onClick={handleCancelChanges}
              disabled={isSaving}
              data-testid="profile-cancel-button"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
          </form>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Meu lider
          </h3>
          <div className="mt-4">
            {leaderLoading ? (
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                Carregando informacoes do lider...
              </div>
            ) : leader ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full bg-cover bg-center border border-slate-200 dark:border-slate-700"
                    style={{ backgroundImage: `url("${leader.avatar}")` }}
                  />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {leader.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {leader.role} • {leader.department}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-slate-400">mail</span>
                    <span className="truncate">{leader.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-slate-400">call</span>
                    <span className="truncate">{leader.phone}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => (window.location.href = `mailto:${leader.email}`)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Enviar e-mail
                  </button>
                  <button
                    type="button"
                    onClick={() => (window.location.href = `tel:${leader.phone.replace(/\D/g, "")}`)}
                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    Ligar
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                Nenhum lider definido para seu perfil. Solicite ao gestor a atribuicao.
              </div>
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Preferencias
          </h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Notificacoes</p>
                <p className="text-xs text-slate-500">Receber alertas importantes</p>
              </div>
              <button
                type="button"
                onClick={() => updateField("notificationsEnabled", !formData.notificationsEnabled)}
                className={`flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                  formData.notificationsEnabled ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                }`}
                aria-label="Alternar notificacoes"
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    formData.notificationsEnabled ? "translate-x-5" : ""
                  }`}
                ></span>
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Tema escuro</p>
                <p className="text-xs text-slate-500">Ajuste visual do aplicativo</p>
              </div>
              <button
                type="button"
                onClick={() => updateField("darkTheme", !formData.darkTheme)}
                className={`flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                  formData.darkTheme ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                }`}
                aria-label="Alternar tema escuro"
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    formData.darkTheme ? "translate-x-5" : ""
                  }`}
                ></span>
              </button>
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
