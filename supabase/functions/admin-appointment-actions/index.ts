import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCancellationCustomerEmail
} from "../_shared/email-templates.ts";
import type { AppointmentEmailData } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const allowedStatuses = new Set(["pending", "confirmed", "completed", "cancelled"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return jsonResponse({ error: "You must be signed in to manage appointments." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid admin action payload." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user?.email) {
    return jsonResponse({ error: "Your admin session could not be verified." }, 401);
  }

  const adminEmail = userData.user.email.toLowerCase();
  const { data: adminRecord, error: adminError } = await adminClient
    .from("admin_users")
    .select("email")
    .eq("email", adminEmail)
    .maybeSingle();

  if (adminError) {
    return jsonResponse({ error: "Could not verify admin access." }, 500);
  }

  if (!adminRecord) {
    return jsonResponse({ error: "This email is not authorised for admin actions." }, 403);
  }

  const action = String(payload.action || "").trim().toLowerCase();
  if (action === "update-status") {
    return await handleStatusUpdate(payload, adminClient, resendApiKey, resendFromEmail);
  }

  if (action === "delete-past-appointment") {
    return await handlePastAppointmentDelete(payload, adminClient);
  }

  return jsonResponse({ error: "Unknown admin action." }, 400);
});

async function handleStatusUpdate(payload: Record<string, unknown>, adminClient: ReturnType<typeof createClient>, resendApiKey: string, resendFromEmail: string) {
  const appointmentId = String(payload.appointmentId || "").trim();
  const nextStatus = String(payload.status || "").trim().toLowerCase();

  if (!appointmentId) {
    return jsonResponse({ error: "Appointment ID is required." }, 400);
  }

  if (!allowedStatuses.has(nextStatus)) {
    return jsonResponse({ error: "A valid appointment status is required." }, 400);
  }

  const appointment = await fetchAppointment(adminClient, appointmentId);
  if (!appointment) {
    return jsonResponse({ error: "Appointment not found." }, 404);
  }

  const previousStatus = String(appointment.status || "pending").toLowerCase();
  if (previousStatus === nextStatus) {
    return jsonResponse({
      success: true,
      appointmentId,
      status: nextStatus,
      unchanged: true,
      notifications: { customer: "skipped", reason: "Status was already set." }
    }, 200);
  }

  const { data: updatedAppointment, error: updateError } = await adminClient
    .from("appointments")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", appointmentId)
    .select("id, service, booking_date, booking_time, customer_name, customer_phone, customer_email, notes, status")
    .single();

  if (updateError || !updatedAppointment) {
    return jsonResponse({ error: "Could not update appointment status." }, 500);
  }

  let notifications: Record<string, string | string[]> = {
    customer: "skipped"
  };

  if (nextStatus === "cancelled") {
    notifications = await sendCancellationEmail(updatedAppointment, resendApiKey, resendFromEmail);
  }

  return jsonResponse({
    success: true,
    appointmentId,
    status: nextStatus,
    notifications
  }, 200);
}

async function handlePastAppointmentDelete(payload: Record<string, unknown>, adminClient: ReturnType<typeof createClient>) {
  const appointmentId = String(payload.appointmentId || "").trim();
  if (!appointmentId) {
    return jsonResponse({ error: "Appointment ID is required." }, 400);
  }

  const appointment = await fetchAppointment(adminClient, appointmentId);
  if (!appointment) {
    return jsonResponse({ error: "Appointment not found." }, 404);
  }

  if (!isPastAppointmentDate(String(appointment.booking_date || ""))) {
    return jsonResponse({ error: "Only past appointments can be removed." }, 400);
  }

  const { error: deleteError } = await adminClient
    .from("appointments")
    .delete()
    .eq("id", appointmentId);

  if (deleteError) {
    return jsonResponse({ error: "Could not remove the appointment." }, 500);
  }

  return jsonResponse({ success: true, appointmentId }, 200);
}

async function fetchAppointment(adminClient: ReturnType<typeof createClient>, appointmentId: string) {
  const { data, error } = await adminClient
    .from("appointments")
    .select("id, service, booking_date, booking_time, customer_name, customer_phone, customer_email, notes, status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function sendCancellationEmail(appointment: AppointmentEmailData, resendApiKey: string, resendFromEmail: string) {
  if (!isNotificationSendingEnabled()) {
    return { customer: "skipped", reason: "Email sending is disabled." };
  }

  if (!resendApiKey || !resendFromEmail) {
    return { customer: "skipped", reason: "Resend email settings are missing." };
  }

  const emailContent = buildCancellationCustomerEmail(appointment);

  try {
    await sendResendEmail(resendApiKey, {
      from: resendFromEmail,
      to: [appointment.customer_email],
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });

    return { customer: "sent" };
  } catch (error) {
    return {
      customer: "failed",
      errors: ["Customer cancellation email: " + String(error)]
    };
  }
}

async function sendResendEmail(apiKey: string, payload: Record<string, unknown>) {
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

function isPastAppointmentDate(value: string) {
  const today = new Date().toISOString().split("T")[0];
  return String(value || "") < today;
}

function isNotificationSendingEnabled() {
  return String(Deno.env.get("BOOKING_NOTIFICATION_EMAILS_ENABLED") || "").toLowerCase() === "true";
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
