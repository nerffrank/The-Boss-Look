import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildBookingCustomerEmail,
  buildShopBookingAlertEmail,
  normalizeTime
} from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid booking payload." }, 400);
  }

  const validationError = validateBookingPayload(payload);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const bookingRow = {
    service: String(payload.service || "").trim(),
    booking_date: String(payload.date || "").trim(),
    booking_time: normalizeTime(payload.time) + ":00",
    customer_name: String(payload.name || "").trim(),
    customer_phone: String(payload.phone || "").trim(),
    customer_email: String(payload.email || "").trim().toLowerCase(),
    notes: String(payload.notes || "").trim()
  };

  const { data: appointment, error: insertError } = await supabaseAdmin
    .from("appointments")
    .insert([bookingRow])
    .select("id, service, booking_date, booking_time, customer_name, customer_phone, customer_email, notes, status")
    .single();

  if (insertError) {
    const message = String(insertError.message || "");
    if (message.includes("appointments_active_slot_unique") || message.includes("duplicate key")) {
      return jsonResponse({ error: "That slot has already been taken. Please choose a different time." }, 409);
    }

    return jsonResponse({ error: "Could not save booking right now." }, 500);
  }

  const notifications = await sendBookingEmails(appointment);
  return jsonResponse({ success: true, appointmentId: appointment.id, notifications }, 200);
});

function validateBookingPayload(payload) {
  if (!payload || typeof payload !== "object") return "Booking details are missing.";
  if (!String(payload.service || "").trim()) return "Service is required.";
  if (!String(payload.date || "").trim()) return "Booking date is required.";
  if (!String(payload.time || "").trim()) return "Booking time is required.";
  if (!String(payload.name || "").trim()) return "Customer name is required.";
  if (!String(payload.phone || "").trim()) return "Customer phone is required.";

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "A valid customer email is required.";
  return "";
}

async function sendBookingEmails(appointment) {
  if (!isNotificationSendingEnabled()) {
    return { customer: "skipped", shop: "skipped", reason: "Email sending is disabled." };
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "";
  const shopNotificationEmails = parseRecipientList(Deno.env.get("SHOP_NOTIFICATION_EMAILS") || "");

  if (!resendApiKey || !resendFromEmail) {
    return { customer: "skipped", shop: "skipped", reason: "Resend email settings are missing." };
  }

  const result = { customer: "skipped", shop: "skipped", errors: [] };

  try {
    const customerEmail = buildBookingCustomerEmail(appointment);
    await sendResendEmail(resendApiKey, {
      from: resendFromEmail,
      to: [appointment.customer_email],
      subject: customerEmail.subject,
      html: customerEmail.html,
      text: customerEmail.text
    });
    result.customer = "sent";
  } catch (error) {
    result.errors.push("Customer email: " + String(error));
  }

  if (shopNotificationEmails.length) {
    try {
      const shopEmail = buildShopBookingAlertEmail(appointment);
      await sendResendEmail(resendApiKey, {
        from: resendFromEmail,
        to: shopNotificationEmails,
        subject: shopEmail.subject,
        html: shopEmail.html,
        text: shopEmail.text
      });
      result.shop = "sent";
    } catch (error) {
      result.errors.push("Shop email: " + String(error));
    }
  }

  return result;
}

async function sendResendEmail(apiKey, payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.ok) return;

  let details = response.statusText;
  try {
    details = await response.text();
  } catch {}

  throw new Error(`Resend request failed (${response.status}): ${details}`);
}

function isNotificationSendingEnabled() {
  return String(Deno.env.get("BOOKING_NOTIFICATION_EMAILS_ENABLED") || "").toLowerCase() === "true";
}

function parseRecipientList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
