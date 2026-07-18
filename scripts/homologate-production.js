const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MANAGER_EMAIL",
  "MANAGER_PASSWORD",
  "OWNER_EMAIL",
  "OWNER_PASSWORD"
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options
);
const anonymous = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

async function login(email, password) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error || new Error(`Login sem usuário: ${email}`);
  return { client, user: data.user };
}

async function ownProfile(client, userId, expectedRole) {
  const { data, error } = await client
    .from("profiles")
    .select("id, company_id, role, email")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (data.role !== expectedRole) {
    throw new Error(`Papel inesperado para ${data.email}: ${data.role}`);
  }
  return data;
}

async function main() {
  let temporaryCompanyId;
  let temporaryUserId;
  let uploadedPath;
  let manager;

  try {
    const owner = await login(process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD);
    manager = await login(process.env.MANAGER_EMAIL, process.env.MANAGER_PASSWORD);
    await ownProfile(owner.client, owner.user.id, "OWNER");
    const managerProfile = await ownProfile(manager.client, manager.user.id, "MANAGER");
    console.log("login-owner=ok login-manager=ok");

    const { data: anonymousProfiles, error: anonymousError } = await anonymous
      .from("profiles")
      .select("id")
      .limit(1);
    if (anonymousError) throw anonymousError;
    if ((anonymousProfiles || []).length !== 0) {
      throw new Error("RLS permitiu leitura anônima de profiles");
    }
    console.log("rls-anon=ok");

    const suffix = crypto.randomUUID();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({ name: `Homologação RLS ${suffix}`, status: "ACTIVE" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    temporaryCompanyId = company.id;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `homologacao-${suffix}@example.invalid`,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      app_metadata: { role: "EMPLOYEE", company_id: temporaryCompanyId }
    });
    if (createError) throw createError;
    temporaryUserId = created.user.id;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: temporaryUserId,
      company_id: temporaryCompanyId,
      role: "EMPLOYEE",
      name: "Usuário temporário RLS",
      email: created.user.email,
      status: "ACTIVE"
    });
    if (profileError) throw profileError;

    const { data: crossTenantRows, error: crossTenantError } = await manager.client
      .from("profiles")
      .select("id")
      .eq("id", temporaryUserId);
    if (crossTenantError) throw crossTenantError;
    if ((crossTenantRows || []).length !== 0) {
      throw new Error("RLS permitiu acesso MANAGER entre empresas");
    }
    console.log("rls-multitenant=ok");

    uploadedPath = `${managerProfile.company_id}/${manager.user.id}/homologacao/${suffix}.pdf`;
    const { error: uploadError } = await manager.client.storage
      .from("certificates")
      .upload(uploadedPath, Buffer.from("%PDF-1.4\n% homologacao\n"), {
        contentType: "application/pdf",
        upsert: false
      });
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await manager.client.storage
      .from("certificates")
      .createSignedUrl(uploadedPath, 60);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("URL assinada ausente");
    const response = await fetch(signed.signedUrl);
    if (!response.ok) throw new Error(`Download do upload falhou: HTTP ${response.status}`);
    console.log("storage-upload-signed-download=ok");
  } finally {
    if (uploadedPath && manager) {
      await manager.client.storage.from("certificates").remove([uploadedPath]);
    }
    if (temporaryUserId) await admin.auth.admin.deleteUser(temporaryUserId);
    if (temporaryCompanyId) await admin.from("companies").delete().eq("id", temporaryCompanyId);
  }
}

main().catch((error) => {
  console.error(`homologacao=falhou ${error.message || error}`);
  process.exitCode = 1;
});
