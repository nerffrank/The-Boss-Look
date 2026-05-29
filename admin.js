const adminConfig = window.bookingConfig || {};
const adminSupabaseReady =
  adminConfig.provider === "supabase" &&
  Boolean(adminConfig.supabaseUrl) &&
  Boolean(adminConfig.supabaseAnonKey) &&
  Boolean(window.supabase);

const authPanel = document.getElementById("admin-auth-panel");
const dashboardPanel = document.getElementById("admin-dashboard");
const authForm = document.getElementById("admin-auth-form");
const authSubmit = document.getElementById("admin-auth-submit");
const authEmailInput = document.getElementById("admin-email");
const adminFeedback = document.getElementById("admin-feedback");
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

let adminClient = null;
let cachedAppointments = [];

if (!adminSupabaseReady) {
  setAdminFeedback("Supabase admin mode is not configured yet.", "error");
  authSubmit.disabled = true;
} else {
  authEmailInput.value = adminConfig.adminEmail || "";
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
adminSignout.addEventListener("click", handleAdminSignout);
adminRefresh.addEventListener("click", loadAppointments);
filterStatus.addEventListener("change", renderAppointments);
filterDate.addEventListener("change", renderAppointments);

async function bootAdmin() {
  const sessionResult = await adminClient.auth.getSession();
  const session = sessionResult.data.session;

  adminClient.auth.onAuthStateChange(function (_event, nextSession) {
    syncAdminSession(nextSession);
  });

  await syncAdminSession(session);
}

async function syncAdminSession(session) {
  if (!session) {
    showSignedOutState();
    return;
  }

  const email = session.user && session.user.email ? session.user.email.toLowerCase() : "";
  if (adminConfig.adminEmail && email !== adminConfig.adminEmail.toLowerCase()) {
    await adminClient.auth.signOut();
    setAdminFeedback("This email is not authorised for dashboard access.", "error");
    showSignedOutState();
    return;
  }

  authPanel.hidden = true;
  dashboardPanel.hidden = false;
  adminSignout.hidden = false;
  adminSessionCopy.textContent = "Signed in as " + email + ".";
  await loadAppointments();
}

function showSignedOutState() {
  authPanel.hidden = false;
  dashboardPanel.hidden = true;
  adminSignout.hidden = true;
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const email = authEmailInput.value.trim().toLowerCase();
  if (!email) {
    setAdminFeedback("Enter the admin email first.", "error");
    return;
  }

  if (adminConfig.adminEmail && email !== adminConfig.adminEmail.toLowerCase()) {
    setAdminFeedback("Use the authorised admin email for this dashboard.", "error");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = "Sending...";

  const { error } = await adminClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    setAdminFeedback(error.message || "Could not send the sign-in link.", "error");
  } else {
    setAdminFeedback("Sign-in link sent. Open it from your email to continue.", "success");
  }

  authSubmit.disabled = false;
  authSubmit.textContent = "Send sign-in link";
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

function setAdminFeedback(message, state) {
  adminFeedback.textContent = message;
  if (state) {
    adminFeedback.dataset.state = state;
  } else {
    delete adminFeedback.dataset.state;
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
