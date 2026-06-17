const adminConfig = window.bookingConfig || {};
const adminSupabaseReady =
  adminConfig.provider === "supabase" &&
  Boolean(adminConfig.supabaseUrl) &&
  Boolean(adminConfig.supabaseAnonKey) &&
  Boolean(window.supabase);

const authPanel = document.getElementById("admin-auth-panel");
const recoveryPanel = document.getElementById("admin-recovery-panel");
const dashboardPanel = document.getElementById("admin-dashboard");
const authForm = document.getElementById("admin-auth-form");
const recoveryForm = document.getElementById("admin-recovery-form");
const authSubmit = document.getElementById("admin-auth-submit");
const authEmailInput = document.getElementById("admin-email");
const authPasswordInput = document.getElementById("admin-password");
const passwordResetButton = document.getElementById("admin-password-reset");
const magicLinkButton = document.getElementById("admin-magic-link");
const adminFeedback = document.getElementById("admin-feedback");
const recoverySubmit = document.getElementById("admin-recovery-submit");
const recoveryPasswordInput = document.getElementById("admin-recovery-password");
const recoveryConfirmInput = document.getElementById("admin-recovery-confirm");
const recoveryFeedback = document.getElementById("admin-recovery-feedback");
const recoveryCopy = document.getElementById("admin-recovery-copy");
const adminSignout = document.getElementById("admin-signout");
const adminRefresh = document.getElementById("admin-refresh");
const adminList = document.getElementById("admin-list");
const adminEmpty = document.getElementById("admin-list-empty");
const adminSessionCopy = document.getElementById("admin-session-copy");
const filterStatus = document.getElementById("admin-filter-status");
const filterDate = document.getElementById("admin-filter-date");
const metricTotal = document.getElementById("metric-total");
const metricToday = document.getElementById("metric-today");
const metricPending = document.getElementById("metric-pending");
const adminCurrentUrl = document.getElementById("admin-current-url");
const adminAccessHint = document.getElementById("admin-access-hint");

let adminClient = null;
let cachedAppointments = [];
let isRecoveryFlow = false;
const allowedAdminEmails = normalizeAdminEmails(adminConfig.adminEmails, adminConfig.adminEmail);
const primaryAdminEmail = allowedAdminEmails[0] || "";

renderAccessNote();

if (!adminSupabaseReady) {
  setAdminFeedback("Supabase admin mode is not configured yet.", "error");
  disableAuthActions();
} else {
  authEmailInput.value = primaryAdminEmail;
  adminClient = window.supabase.createClient(adminConfig.supabaseUrl, adminConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  bootAdmin();
}

authForm.addEventListener("submit", handleAdminLogin);
recoveryForm.addEventListener("submit", handleRecoverySubmit);
passwordResetButton.addEventListener("click", handlePasswordResetRequest);
magicLinkButton.addEventListener("click", handleMagicLinkLogin);
adminSignout.addEventListener("click", handleAdminSignout);
adminRefresh.addEventListener("click", loadAppointments);
filterStatus.addEventListener("change", renderAppointments);
filterDate.addEventListener("change", renderAppointments);

async function bootAdmin() {
  const sessionResult = await adminClient.auth.getSession();
  const session = sessionResult.data.session;

  adminClient.auth.onAuthStateChange(async function (event, nextSession) {
    if (event === "PASSWORD_RECOVERY" || (isRecoveryMode() && nextSession)) {
      isRecoveryFlow = true;
      showRecoveryState(nextSession && nextSession.user ? nextSession.user.email : primaryAdminEmail);
      return;
    }

    if (event === "SIGNED_OUT") {
      isRecoveryFlow = false;
      showSignedOutState();
      return;
    }

    await syncAdminSession(nextSession);
  });

  if (isRecoveryMode() && session) {
    isRecoveryFlow = true;
    showRecoveryState(session.user && session.user.email ? session.user.email : primaryAdminEmail);
    return;
  }

  await syncAdminSession(session);
}

async function syncAdminSession(session) {
  if (isRecoveryFlow && isRecoveryMode()) {
    showRecoveryState(session && session.user ? session.user.email : primaryAdminEmail);
    return;
  }

  if (!session) {
    showSignedOutState();
    return;
  }

  const email = session.user && session.user.email ? session.user.email.toLowerCase() : "";
  if (!isAuthorizedAdminEmail(email)) {
    await adminClient.auth.signOut();
    setAdminFeedback("This email is not authorised for dashboard access.", "error");
    showSignedOutState();
    return;
  }

  isRecoveryFlow = false;
  authPanel.hidden = true;
  recoveryPanel.hidden = true;
  dashboardPanel.hidden = false;
  adminSignout.hidden = false;
  adminSessionCopy.textContent = "Signed in as " + email + ".";
  clearRecoveryUrlState();
  await loadAppointments();
}

function showSignedOutState() {
  authPanel.hidden = false;
  recoveryPanel.hidden = true;
  dashboardPanel.hidden = true;
  adminSignout.hidden = true;
  setRecoveryFeedback("", "");
}

function showRecoveryState(email) {
  authPanel.hidden = true;
  recoveryPanel.hidden = false;
  dashboardPanel.hidden = true;
  adminSignout.hidden = false;
  recoveryCopy.textContent =
    "Set a new password for " +
    (email || "the authorised admin email") +
    ". Once saved, you can sign in directly from this dashboard.";
  setRecoveryFeedback("", "");
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const email = readAdminEmail();
  const password = authPasswordInput.value.trim();

  if (!validateAdminEmail(email)) {
    return;
  }

  if (!password) {
    setAdminFeedback("Enter the admin password.", "error");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = "Signing in...";

  const { data, error } = await adminClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setAdminFeedback(formatAdminAuthError(error.message), "error");
  } else {
    setAdminFeedback("Signed in successfully. Loading appointments...", "success");
    await syncAdminSession(data.session);
  }

  authSubmit.disabled = false;
  authSubmit.textContent = "Sign in";
}

async function handlePasswordResetRequest() {
  const email = readAdminEmail();
  if (!validateAdminEmail(email)) {
    return;
  }

  passwordResetButton.disabled = true;
  passwordResetButton.textContent = "Sending...";

  const { error } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: buildRecoveryUrl()
  });

  if (error) {
    setAdminFeedback(formatAdminAuthError(error.message), "error");
  } else {
    setAdminFeedback("Password reset link sent. Open it from your email to create or change the admin password.", "success");
  }

  passwordResetButton.disabled = false;
  passwordResetButton.textContent = "Email reset link";
}

async function handleMagicLinkLogin() {
  const email = readAdminEmail();
  if (!validateAdminEmail(email)) {
    return;
  }

  magicLinkButton.disabled = true;
  magicLinkButton.textContent = "Sending...";

  const { error } = await adminClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: buildStandardRedirectUrl()
    }
  });

  if (error) {
    setAdminFeedback(formatAdminAuthError(error.message), "error");
  } else {
    setAdminFeedback("Magic link sent. Open it from your email to continue.", "success");
  }

  magicLinkButton.disabled = false;
  magicLinkButton.textContent = "Use magic link instead";
}

async function handleRecoverySubmit(event) {
  event.preventDefault();

  const nextPassword = recoveryPasswordInput.value.trim();
  const confirmPassword = recoveryConfirmInput.value.trim();

  if (!nextPassword || nextPassword.length < 8) {
    setRecoveryFeedback("Use a password with at least 8 characters.", "error");
    return;
  }

  if (nextPassword !== confirmPassword) {
    setRecoveryFeedback("The password confirmation does not match.", "error");
    return;
  }

  recoverySubmit.disabled = true;
  recoverySubmit.textContent = "Saving...";

  const { error } = await adminClient.auth.updateUser({
    password: nextPassword
  });

  if (error) {
    setRecoveryFeedback(formatAdminAuthError(error.message), "error");
    recoverySubmit.disabled = false;
    recoverySubmit.textContent = "Save new password";
    return;
  }

  setRecoveryFeedback("Password saved. You can now use email + password on this dashboard.", "success");
  authPasswordInput.value = "";
  recoveryForm.reset();
  isRecoveryFlow = false;

  const sessionResult = await adminClient.auth.getSession();
  await syncAdminSession(sessionResult.data.session);

  recoverySubmit.disabled = false;
  recoverySubmit.textContent = "Save new password";
}

async function handleAdminSignout() {
  await adminClient.auth.signOut();
  cachedAppointments = [];
  renderAppointments();
  showSignedOutState();
  setAdminFeedback("Signed out of the admin dashboard.", "success");
}

async function loadAppointments() {
  if (!adminClient) {
    return;
  }

  adminRefresh.disabled = true;
  adminRefresh.textContent = "Refreshing...";

  const { data, error } = await adminClient
    .from("appointments")
    .select("*")
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if (error) {
    setAdminFeedback(error.message || "Could not load appointments.", "error");
    adminRefresh.disabled = false;
    adminRefresh.textContent = "Refresh";
    return;
  }

  cachedAppointments = data || [];
  renderAppointments();
  adminRefresh.disabled = false;
  adminRefresh.textContent = "Refresh";
}

function renderAppointments() {
  const today = formatDate(new Date());
  const statusFilter = filterStatus.value;
  const dateFilter = filterDate.value;

  const filteredAppointments = cachedAppointments.filter(function (appointment) {
    const appointmentDate = appointment.booking_date;
    const statusMatches = statusFilter === "all" || appointment.status === statusFilter;
    const dateMatches =
      dateFilter === "all" ||
      (dateFilter === "today" && appointmentDate === today) ||
      (dateFilter === "upcoming" && appointmentDate >= today) ||
      (dateFilter === "past" && appointmentDate < today);

    return statusMatches && dateMatches;
  });

  metricTotal.textContent = String(cachedAppointments.length);
  metricToday.textContent = String(
    cachedAppointments.filter(function (appointment) {
      return appointment.booking_date === today;
    }).length
  );
  metricPending.textContent = String(
    cachedAppointments.filter(function (appointment) {
      return appointment.status === "pending";
    }).length
  );

  adminList.innerHTML = "";

  if (!filteredAppointments.length) {
    adminEmpty.hidden = false;
    return;
  }

  adminEmpty.hidden = true;

  filteredAppointments.forEach(function (appointment) {
    const card = document.createElement("article");
    card.className = "admin-card";

    card.innerHTML =
      '<div class="admin-card-top"><strong>' +
      escapeHtml(appointment.customer_name) +
      '</strong><span class="admin-status status-' +
      escapeHtml(appointment.status || "pending") +
      '">' +
      escapeHtml(appointment.status || "pending") +
      "</span></div>" +
      '<div class="admin-card-meta"><span>' +
      formatBookingDate(appointment.booking_date) +
      " at " +
      normalizeTime(appointment.booking_time) +
      "</span><span>" +
      escapeHtml(appointment.service || "In-shop consultation") +
      "</span></div>" +
      "<p>" +
      escapeHtml(appointment.customer_phone) +
      " | " +
      escapeHtml(appointment.customer_email) +
      "</p>" +
      "<p>" +
      (appointment.notes ? escapeHtml(appointment.notes) : "No notes left by the client.") +
      "</p>";

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";

    ["pending", "confirmed", "completed", "cancelled"].forEach(function (status) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = status;
      button.disabled = appointment.status === status;
      button.addEventListener("click", function () {
        updateAppointmentStatus(appointment.id, status);
      });
      actions.appendChild(button);
    });

    card.appendChild(actions);
    adminList.appendChild(card);
  });
}

async function updateAppointmentStatus(appointmentId, nextStatus) {
  const { error } = await adminClient
    .from("appointments")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", appointmentId);

  if (error) {
    setAdminFeedback(error.message || "Could not update appointment status.", "error");
    return;
  }

  setAdminFeedback("Appointment status updated to " + nextStatus + ".", "success");
  await loadAppointments();
}

function readAdminEmail() {
  return authEmailInput.value.trim().toLowerCase();
}

function validateAdminEmail(email) {
  if (!email) {
    setAdminFeedback("Enter the admin email first.", "error");
    return false;
  }

  if (!isAuthorizedAdminEmail(email)) {
    setAdminFeedback("Use one of the authorised admin emails for this dashboard.", "error");
    return false;
  }

  return true;
}

function isAuthorizedAdminEmail(email) {
  if (!email) {
    return false;
  }

  if (!allowedAdminEmails.length) {
    return true;
  }

  return allowedAdminEmails.includes(String(email).toLowerCase());
}

function normalizeAdminEmails(emailList, fallbackEmail) {
  const candidates = Array.isArray(emailList) ? emailList.slice() : [];
  if (fallbackEmail) {
    candidates.unshift(fallbackEmail);
  }

  return Array.from(
    new Set(
      candidates
        .map(function (value) {
          return String(value || "").trim().toLowerCase();
        })
        .filter(Boolean)
    )
  );
}

function disableAuthActions() {
  authSubmit.disabled = true;
  passwordResetButton.disabled = true;
  magicLinkButton.disabled = true;
}

function setAdminFeedback(message, state) {
  adminFeedback.textContent = message;
  if (state) {
    adminFeedback.dataset.state = state;
  } else {
    delete adminFeedback.dataset.state;
  }
}

function setRecoveryFeedback(message, state) {
  recoveryFeedback.textContent = message;
  if (state) {
    recoveryFeedback.dataset.state = state;
  } else {
    delete recoveryFeedback.dataset.state;
  }
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function normalizeTime(time) {
  return String(time).slice(0, 5);
}

function formatBookingDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildStandardRedirectUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("mode");
  url.hash = "";
  return url.origin + url.pathname + url.search;
}

function buildRecoveryUrl() {
  const url = new URL(buildStandardRedirectUrl());
  url.searchParams.set("mode", "recovery");
  return url.toString();
}

function clearRecoveryUrlState() {
  if (!window.history || !window.history.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("mode");
  url.hash = "";
  window.history.replaceState({}, "", url.pathname + url.search);
}

function isRecoveryMode() {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("mode") === "recovery" || window.location.hash.includes("type=recovery");
}

function renderAccessNote() {
  if (adminCurrentUrl) {
    adminCurrentUrl.textContent = buildStandardRedirectUrl();
  }

  if (!adminAccessHint) {
    return;
  }

  const isLocalHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

  if (isLocalHost) {
    adminAccessHint.textContent =
      "Local preview access works here. Keep this local server running when you open any sign-in or reset email, and make sure this exact URL is added to Supabase Redirect URLs.";
    return;
  }

  adminAccessHint.textContent =
    "This live admin page can be used for everyday access once your authorised email is set up with a password.";
}

function formatAdminAuthError(message) {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("rate limit")) {
    return "Too many auth emails were requested recently. Wait a minute, then try again.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "That email/password combination was not accepted. Check the password or send yourself a reset link.";
  }

  if (normalized.includes("password")) {
    return message || "There was a password issue. Try a stronger password or request a reset link.";
  }

  return message || "The admin sign-in request could not be completed.";
}
