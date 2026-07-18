const { createClient } = require("@supabase/supabase-js");

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OWNER_EMAIL",
  "OWNER_PASSWORD",
  "MANAGER_EMAIL",
  "MANAGER_PASSWORD"
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function ensureCompany() {
  const name = process.env.COMPANY_NAME || "OM Way";
  const { data: existing, error: selectError } = await supabase
    .from("companies")
    .select("id")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("companies")
    .insert({ name, status: "ACTIVE" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

async function ensureUser({ email, password, role, name, companyId }) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role, company_id: companyId },
      user_metadata: { name }
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      app_metadata: { ...user.app_metadata, role, company_id: companyId }
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    company_id: companyId,
    role,
    name,
    email,
    status: "ACTIVE"
  });
  if (profileError) throw profileError;
  console.log(`${role}: ${email}`);
}

async function main() {
  const companyId = await ensureCompany();
  await ensureUser({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
    role: "OWNER",
    name: process.env.OWNER_NAME || "Octávio",
    companyId
  });
  await ensureUser({
    email: process.env.MANAGER_EMAIL,
    password: process.env.MANAGER_PASSWORD,
    role: "MANAGER",
    name: process.env.MANAGER_NAME || "Octávio Memória",
    companyId
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
