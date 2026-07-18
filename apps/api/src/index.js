const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const port = Number(process.env.PORT || 3002);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const stripeEnabled = parseBoolean(process.env.STRIPE_ENABLED);
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripePriceIds = parseCsvSet(
  process.env.STRIPE_PRICE_IDS || process.env.STRIPE_PRICE_ID || ""
);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const appOrigin = parseOrigin(appUrl);
const corsAllowedOrigins = buildAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS, appOrigin);
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
const apiRateLimitWindowMs = parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const apiRateLimitMax = parsePositiveInteger(process.env.RATE_LIMIT_MAX, isProduction ? 120 : 500);
const adminRateLimitWindowMs = parsePositiveInteger(
  process.env.ADMIN_RATE_LIMIT_WINDOW_MS,
  10 * 60_000
);
const adminRateLimitMax = parsePositiveInteger(
  process.env.ADMIN_RATE_LIMIT_MAX,
  isProduction ? 20 : 100
);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

app.set("trust proxy", trustProxy);

validateEnvironment();

const webDist = path.join(__dirname, "..", "..", "web", "dist");
// Always mount static. If dist doesn't exist yet, requests will 404, but it
// starts serving immediately after a build without needing a restart.

app.use(assignRequestId);
app.use(logRequests);
app.use(applySecurityHeaders);
app.use(cors(buildCorsOptions()));
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleStripeWebhook
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", createRateLimit(apiRateLimitWindowMs, apiRateLimitMax, "api"));
app.get("/env.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const publicEnv = {
    VITE_SUPABASE_URL: supabaseUrl || "",
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey || "",
    VITE_ENABLE_DEMO_MODE: "false"
  };
  res.send(`globalThis.__APP_ENV__ = ${JSON.stringify(publicEnv)};`);
});
app.use(express.static(webDist));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    environment: nodeEnv
  });
});

app.get("/api/ready", (_req, res) => {
  const checks = {
    webDistPresent: fs.existsSync(path.join(webDist, "index.html")),
    supabaseAdminConfigured: Boolean(supabaseAdmin),
    appUrlConfigured: Boolean(appOrigin),
    stripeConfigured:
      !stripeEnabled || Boolean(stripe && stripeWebhookSecret && stripePriceIds.size > 0)
  };
  const ready =
    checks.webDistPresent &&
    checks.appUrlConfigured &&
    (!isProduction || checks.supabaseAdminConfigured) &&
    checks.stripeConfigured;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "degraded",
    time: new Date().toISOString(),
    environment: nodeEnv,
    checks
  });
});

app.get("/api/info", (_req, res) => {
  res.json({
    name: "Controle de Ponto OM Way",
    version: "0.1.0",
    message: "API inicial pronta."
  });
});

function normalizeSpace(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function parseBoolean(value) {
  if (typeof value !== "string") return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parseCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeRole(value) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function parseOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function parseCsv(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAllowedOrigins(rawValue, fallbackOrigin) {
  const origins = new Set(parseCsv(rawValue));
  if (fallbackOrigin) origins.add(fallbackOrigin);
  return origins;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseTrustProxy(value) {
  if (value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }
  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }
  return value;
}

function logEvent(level, event, details = {}) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...details
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function validateEnvironment() {
  const errors = [];

  if (!Number.isFinite(port) || port <= 0) {
    errors.push("PORT invalida.");
  }
  if (!appOrigin) {
    errors.push("APP_URL invalida. Informe uma URL absoluta valida.");
  }

  if (isProduction) {
    if (!supabaseUrl) {
      errors.push("SUPABASE_URL obrigatoria em producao.");
    }
    if (!supabaseServiceKey) {
      errors.push("SUPABASE_SERVICE_ROLE_KEY obrigatoria em producao.");
    }
    if (!supabaseAnonKey) {
      errors.push("SUPABASE_ANON_KEY obrigatoria em producao.");
    }
    if (corsAllowedOrigins.size === 0) {
      errors.push("CORS_ALLOWED_ORIGINS obrigatoria em producao.");
    }
  }
  if (stripeEnabled) {
    if (!stripeSecretKey) errors.push("STRIPE_SECRET_KEY obrigatoria com Stripe habilitado.");
    if (!stripeWebhookSecret) {
      errors.push("STRIPE_WEBHOOK_SECRET obrigatoria com Stripe habilitado.");
    }
    if (stripePriceIds.size === 0) {
      errors.push("STRIPE_PRICE_IDS obrigatoria com Stripe habilitado.");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuracao de ambiente invalida: ${errors.join(" ")}`);
  }

  if (!supabaseAdmin) {
    logEvent("warn", "supabase_admin_disabled", {
      reason: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente"
    });
  }
}

function assignRequestId(req, res, next) {
  const incomingRequestId = req.headers["x-request-id"];
  req.requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId.trim()
      : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

function logRequests(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    logEvent("info", "request_completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip
    });
  });
  next();
}

function applySecurityHeaders(_req, res, next) {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  const connectSources = ["'self'", "https://api.stripe.com"];
  const supabaseOrigin = parseOrigin(supabaseUrl);
  if (supabaseOrigin) connectSources.push(supabaseOrigin);
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src ${connectSources.join(" ")}`,
      "font-src 'self' https://fonts.gstatic.com",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "manifest-src 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "worker-src 'self' blob:"
    ].join("; ")
  );
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowedOrigins.size === 0 || corsAllowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    optionsSuccessStatus: 204,
    maxAge: 86400
  };
}

function createRateLimit(windowMs, maxRequests, scope) {
  const hits = new Map();

  return (req, res, next) => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      logEvent("warn", "rate_limit_exceeded", {
        requestId: req.requestId,
        scope,
        ip: key,
        path: req.originalUrl
      });
      res.status(429).json({ error: "Limite de requisicoes excedido. Tente novamente em instantes." });
      return;
    }

    current.count += 1;
    next();
  };
}

function canProvisionRole(adminRole, targetRole) {
  const adminRoles = ["OWNER", "SUPER_ADMIN"];
  if (adminRoles.includes(adminRole)) {
    return ["EMPLOYEE", "LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"].includes(targetRole);
  }

  if (adminRole === "MANAGER") {
    return ["EMPLOYEE", "LEADER"].includes(targetRole);
  }

  return false;
}

async function requireManager(req, res, next) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: "Supabase admin nao configurado." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Token de acesso ausente." });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    res.status(401).json({ error: "Token invalido ou expirado." });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    res.status(403).json({ error: "Perfil nao autorizado." });
    return;
  }

  if (!["MANAGER", "OWNER", "SUPER_ADMIN"].includes(profile.role)) {
    res.status(403).json({ error: "Somente gestores podem cadastrar usuarios." });
    return;
  }

  if (!profile.company_id) {
    res.status(400).json({ error: "Empresa nao vinculada ao usuario gestor." });
    return;
  }

  req.adminContext = {
    userId: profile.id,
    role: profile.role,
    companyId: profile.company_id
  };
  next();
}

async function requireBillingOwner(req, res, next) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: "Supabase admin nao configurado." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Token de acesso ausente." });
    return;
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    res.status(401).json({ error: "Token invalido ou expirado." });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, company_id, email")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || !["OWNER", "SUPER_ADMIN"].includes(profile.role)) {
    res.status(403).json({ error: "Somente proprietarios podem gerenciar a assinatura." });
    return;
  }
  if (!profile.company_id) {
    res.status(400).json({ error: "Empresa nao vinculada ao proprietario." });
    return;
  }

  req.billingContext = {
    userId: profile.id,
    companyId: profile.company_id,
    email: authData.user.email || profile.email || undefined
  };
  next();
}

function ensureStripe(res) {
  if (!stripeEnabled || !stripe) {
    res.status(503).json({ error: "Cobranca ainda nao configurada." });
    return false;
  }
  return true;
}

async function findBillingSubscription(companyId) {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function stripeId(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id || null;
}

async function upsertStripeSubscription(subscription, companyIdOverride) {
  const companyId = companyIdOverride || subscription.metadata?.company_id;
  if (!companyId) throw new Error("Assinatura Stripe sem company_id.");

  const item = subscription.items?.data?.[0];
  const { error } = await supabaseAdmin.from("billing_subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id: stripeId(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_price_id: item?.price?.id || null,
      status: subscription.status,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      updated_at: new Date().toISOString()
    },
    { onConflict: "company_id" }
  );
  if (error) throw error;
}

async function handleStripeEvent(event) {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await upsertStripeSubscription(event.data.object);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const subscriptionId = stripeId(session.subscription);
    const companyId = session.metadata?.company_id;
    if (subscriptionId && companyId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertStripeSubscription(subscription, companyId);
    }
  }
}

async function handleStripeWebhook(req, res) {
  if (!ensureStripe(res)) return;
  if (!stripeWebhookSecret) {
    res.status(503).json({ error: "Webhook Stripe nao configurado." });
    return;
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (error) {
    logEvent("warn", "stripe_webhook_signature_invalid", {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : "Assinatura invalida"
    });
    res.status(400).json({ error: "Assinatura do webhook invalida." });
    return;
  }

  try {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("event_id", event.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.processed_at) {
      res.json({ received: true, duplicate: true });
      return;
    }

    const { error: receivedError } = await supabaseAdmin.from("stripe_webhook_events").upsert(
      {
        event_id: event.id,
        event_type: event.type,
        livemode: Boolean(event.livemode),
        last_error: null
      },
      { onConflict: "event_id" }
    );
    if (receivedError) throw receivedError;

    await handleStripeEvent(event);
    const { error: processedError } = await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), last_error: null })
      .eq("event_id", event.id);
    if (processedError) throw processedError;
    res.json({ received: true });
  } catch (error) {
    await supabaseAdmin
      .from("stripe_webhook_events")
      .upsert(
        {
          event_id: event.id,
          event_type: event.type,
          livemode: Boolean(event.livemode),
          last_error: error instanceof Error ? error.message : "Erro desconhecido"
        },
        { onConflict: "event_id" }
      );
    logEvent("error", "stripe_webhook_failed", {
      requestId: req.requestId,
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    res.status(500).json({ error: "Falha ao processar webhook." });
  }
}

app.get("/api/billing/subscription", requireBillingOwner, async (req, res) => {
  try {
    const subscription = await findBillingSubscription(req.billingContext.companyId);
    res.json({
      enabled: stripeEnabled,
      subscription: subscription
        ? {
            status: subscription.status,
            priceId: subscription.stripe_price_id,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel consultar a assinatura." });
  }
});

app.post("/api/billing/checkout", requireBillingOwner, async (req, res) => {
  if (!ensureStripe(res)) return;
  const requestedPriceId = normalizeSpace(req.body?.priceId);
  const priceId = requestedPriceId || Array.from(stripePriceIds)[0];
  if (!priceId || !stripePriceIds.has(priceId)) {
    res.status(400).json({ error: "Plano Stripe invalido." });
    return;
  }

  try {
    const existing = await findBillingSubscription(req.billingContext.companyId);
    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.billingContext.email,
        metadata: {
          company_id: req.billingContext.companyId,
          owner_user_id: req.billingContext.userId
        }
      });
      customerId = customer.id;
      const { error } = await supabaseAdmin.from("billing_subscriptions").upsert(
        {
          company_id: req.billingContext.companyId,
          stripe_customer_id: customerId,
          status: "incomplete",
          updated_at: new Date().toISOString()
        },
        { onConflict: "company_id" }
      );
      if (error) throw error;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.billingContext.companyId,
      metadata: { company_id: req.billingContext.companyId },
      subscription_data: { metadata: { company_id: req.billingContext.companyId } },
      success_url: `${appUrl}/configuracoes-empresa?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/configuracoes-empresa?billing=cancelled`
    });
    res.json({ url: session.url });
  } catch (error) {
    logEvent("error", "stripe_checkout_failed", {
      requestId: req.requestId,
      companyId: req.billingContext.companyId,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    res.status(500).json({ error: "Nao foi possivel iniciar o pagamento." });
  }
});

app.post("/api/billing/portal", requireBillingOwner, async (req, res) => {
  if (!ensureStripe(res)) return;
  try {
    const existing = await findBillingSubscription(req.billingContext.companyId);
    if (!existing?.stripe_customer_id) {
      res.status(404).json({ error: "Cliente Stripe ainda nao criado." });
      return;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: existing.stripe_customer_id,
      return_url: `${appUrl}/configuracoes-empresa`
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel abrir o portal de cobranca." });
  }
});

app.post(
  "/api/admin/users",
  createRateLimit(adminRateLimitWindowMs, adminRateLimitMax, "admin_users"),
  requireManager,
  async (req, res) => {
  try {
    const { email, name, role, department, accessMode, tempPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeSpace(name);
    const normalizedRole = normalizeRole(role);
    const normalizedDepartment = normalizeSpace(department);
    const mode = accessMode === "temp_password" ? "temp_password" : "invite";

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: "Email invalido." });
      return;
    }
    if (normalizedName.length < 3) {
      res.status(400).json({ error: "Nome invalido." });
      return;
    }
    if (!["EMPLOYEE", "LEADER", "MANAGER", "OWNER", "SUPER_ADMIN"].includes(normalizedRole)) {
      res.status(400).json({ error: "Cargo de acesso invalido." });
      return;
    }
    if (!canProvisionRole(req.adminContext.role, normalizedRole)) {
      res.status(403).json({ error: "Seu perfil nao pode criar usuarios com este nivel de acesso." });
      return;
    }
    if (!normalizedDepartment) {
      res.status(400).json({ error: "Departamento obrigatorio." });
      return;
    }
    if (mode === "temp_password") {
      if (typeof tempPassword !== "string" || tempPassword.trim().length < 8) {
        res.status(400).json({ error: "Senha temporaria invalida." });
        return;
      }
    }

    const { companyId } = req.adminContext;
    let departmentId = null;

    const { data: existingDept } = await supabaseAdmin
      .from("departments")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", normalizedDepartment)
      .maybeSingle();

    if (existingDept?.id) {
      departmentId = existingDept.id;
    } else {
      const { data: insertedDept, error: deptError } = await supabaseAdmin
        .from("departments")
        .insert({ company_id: companyId, name: normalizedDepartment })
        .select("id")
        .single();
      if (deptError) {
        res.status(500).json({ error: "Nao foi possivel criar departamento." });
        return;
      }
      departmentId = insertedDept?.id ?? null;
    }

    const userMetadata = {
      role: normalizedRole,
      company_id: companyId,
      name: normalizedName,
      must_change_password: mode === "temp_password"
    };

    let userId = null;
    if (mode === "temp_password") {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword.trim(),
        email_confirm: true,
        user_metadata: userMetadata
      });
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      userId = data?.user?.id ?? null;
    } else {
      const redirectTo = `${appUrl.replace(/\/$/, "")}/#/definir-senha`;
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        { data: userMetadata, redirectTo }
      );
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      userId = data?.user?.id ?? null;
    }

    if (userId) {
      const { error: profileUpsertError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          company_id: companyId,
          department_id: departmentId,
          role: normalizedRole,
          name: normalizedName,
          email: normalizedEmail
        },
        { onConflict: "id" }
      );
      if (profileUpsertError) {
        logEvent("error", "profile_upsert_failed", {
          requestId: req.requestId,
          userId,
          companyId,
          error: profileUpsertError.message
        });
        res.status(500).json({ error: "Usuario criado, mas o perfil nao foi sincronizado." });
        return;
      }
    }

    logEvent("info", "admin_user_created", {
      requestId: req.requestId,
      actorUserId: req.adminContext.userId,
      actorRole: req.adminContext.role,
      companyId,
      userId,
      targetRole: normalizedRole,
      mode
    });
    res.status(201).json({ ok: true, userId, mode });
  } catch (error) {
    logEvent("error", "admin_user_creation_failed", {
      requestId: req.requestId,
      actorUserId: req.adminContext?.userId,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    res.status(500).json({ error: "Erro interno ao cadastrar usuario." });
  }
  }
);

app.get("/", (_req, res) => {
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    res.sendFile(path.join(webDist, "index.html"));
    return;
  }
  res.json({
    status: "ok",
    message: "API ativa. Frontend nao buildado."
  });
});

app.use((error, req, res, _next) => {
  if (error?.message === "Origin not allowed by CORS") {
    logEvent("warn", "cors_blocked", {
      requestId: req.requestId,
      origin: req.headers.origin,
      path: req.originalUrl
    });
    res.status(403).json({ error: "Origem nao permitida." });
    return;
  }

  logEvent("error", "request_failed", {
    requestId: req.requestId,
    path: req.originalUrl,
    error: error instanceof Error ? error.message : "Erro desconhecido"
  });
  res.status(500).json({ error: "Erro interno." });
});

if (require.main === module) {
  app.listen(port, () => {
    logEvent("info", "api_started", {
      port,
      environment: nodeEnv,
      appUrl,
      corsAllowedOrigins: Array.from(corsAllowedOrigins)
    });
  });
}

module.exports = app;
