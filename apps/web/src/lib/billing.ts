import { supabase } from "./supabase";

export type BillingSubscription = {
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingStatus = {
  enabled: boolean;
  subscription: BillingSubscription | null;
};

async function authorizedRequest(path: string, init?: RequestInit) {
  if (!supabase) throw new Error("Supabase nao configurado.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sessao expirada. Entre novamente.");

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init?.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Falha na cobranca.");
  }
  return payload;
}

export async function loadBillingStatus(): Promise<BillingStatus> {
  return authorizedRequest("/api/billing/subscription");
}

export async function openStripeCheckout(): Promise<void> {
  const result = await authorizedRequest("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({})
  });
  if (!result.url) throw new Error("Stripe nao retornou uma URL.");
  window.location.assign(result.url);
}

export async function openStripePortal(): Promise<void> {
  const result = await authorizedRequest("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({})
  });
  if (!result.url) throw new Error("Stripe nao retornou uma URL.");
  window.location.assign(result.url);
}
