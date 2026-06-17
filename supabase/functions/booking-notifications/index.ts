import { createClient } from "npm:@supabase/supabase-js@2";

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
    await sendResendEmail(resendApiKey, {
      from: resendFromEmail,
      to: [appointment.customer_email],
      subject: "We received your booking request - The Boss Look",
      html: `<h1>The Boss Look</h1><p>We have received your booking request and the team will confirm your appointment by email.</p><p><strong>Date:</strong> ${escapeHtml(formatDisplayDate(appointment.booking_date))}<br /><strong>Time:</strong> ${escapeHtml(normalizeTime(appointment.booking_time))}<br /><strong>Service:</strong> ${escapeHtml(appointment.service || "In-shop consultation")}</p><p>If any detail needs changing, reply to this email before your slot.</p>`,
      text: `The Boss Look\n\nWe have received your booking request and the team will confirm your appointment by email.\n\nDate: ${formatDisplayDate(appointment.booking_date)}\nTime: ${normalizeTime(appointment.booking_time)}\nService: ${appointment.service || "In-shop consultation"}\n`
    });
    result.customer = "sent";
  } catch (error) {
    result.errors.push("Customer email: " + String(error));
  }

  if (shopNotificationEmails.length) {
    try {
      await sendResendEmail(resendApiKey, {
        from: resendFromEmail,
        to: shopNotificationEmails,
        subject: "New booking request - The Boss Look",
        html: `<h1>New booking request</h1><p>A new appointment request has been created on the website.</p><p><strong>Name:</strong> ${escapeHtml(appointment.customer_name)}<br /><strong>Email:</strong> ${escapeHtml(appointment.customer_email)}<br /><strong>Phone:</strong> ${escapeHtml(appointment.customer_phone)}<br /><strong>Date:</strong> ${escapeHtml(formatDisplayDate(appointment.booking_date))}<br /><strong>Time:</strong> ${escapeHtml(normalizeTime(appointment.booking_time))}<br /><strong>Notes:</strong> ${escapeHtml(appointment.notes || "No notes provided.")}</p>`,
        text: `New booking request\n\nName: ${appointment.customer_name}\nEmail: ${appointment.customer_email}\nPhone: ${appointment.customer_phone}\nDate: ${formatDisplayDate(appointment.booking_date)}\nTime: ${normalizeTime(appointment.booking_time)}\nNotes: ${appointment.notes || "No notes provided."}\n`
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

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function formatDisplayDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
