const bookingStorageKey = "theBossLookBookings";
const bookingConfig = window.bookingConfig || { provider: "local", supabaseUrl: "", supabaseAnonKey: "" };
const isSupabaseMode =
  bookingConfig.provider === "supabase" &&
  Boolean(bookingConfig.supabaseUrl) &&
  Boolean(bookingConfig.supabaseAnonKey);
const notificationMode = String(bookingConfig.notificationMode || "disabled").toLowerCase();
const notificationFunctionName = bookingConfig.notificationFunctionName || "booking-notifications";
const defaultServiceLabel = "In-shop consultation";

const openingHours = {
  0: { start: "14:00", end: "22:00" },
  1: { start: "10:00", end: "21:00" },
  2: { start: "10:00", end: "21:00" },
  3: { start: "10:00", end: "21:00" },
  4: { start: "10:00", end: "21:00" },
  5: { start: "10:00", end: "21:00" },
  6: { start: "10:00", end: "21:00" }
};

const dateInput = document.getElementById("booking-date");
const timeSelect = document.getElementById("booking-time");
const bookingForm = document.getElementById("booking-form");
const bookingSubmitButton = document.getElementById("booking-submit");
const feedback = document.getElementById("booking-feedback");
const bookingsList = document.getElementById("bookings-list");
const bookingsEmpty = document.getElementById("bookings-empty");
const bookingSummary = document.getElementById("booking-summary");
const clearBookingsButton = document.getElementById("clear-bookings");

setDateMinimum();
if (bookingSummary || bookingsEmpty || bookingsList) {
  renderStorageState();
}
updateTimeOptions();

dateInput.addEventListener("change", updateTimeOptions);
bookingForm.addEventListener("submit", handleBookingSubmit);
if (clearBookingsButton) {
  clearBookingsButton.addEventListener("click", clearBookings);
}

function setDateMinimum() {
  const today = new Date();
  dateInput.min = formatDate(today);
}

async function updateTimeOptions() {
  const selectedDate = dateInput.value;
  timeSelect.innerHTML = "";

  if (!selectedDate) {
    disableTimeSelect("Select a date first");
    return;
  }

  setFeedback("", "");

  try {
    const slots = await buildTimeSlots(selectedDate);
    if (!slots.length) {
      disableTimeSelect("No slots available");
      return;
    }

    timeSelect.disabled = false;

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Choose a time";
    timeSelect.appendChild(defaultOption);

    slots.forEach(function (slot) {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      timeSelect.appendChild(option);
    });
  } catch (error) {
    console.error(error);
    disableTimeSelect("Could not load time slots");
    setFeedback("We could not load available times right now. Please try again shortly.", "error");
  }
}

function disableTimeSelect(message) {
  timeSelect.disabled = true;
  const option = document.createElement("option");
  option.value = "";
  option.textContent = message;
  timeSelect.appendChild(option);
}

async function buildTimeSlots(dateString) {
  const selectedDate = new Date(dateString + "T00:00:00");
  const hours = openingHours[selectedDate.getDay()];
  if (!hours) {
    return [];
  }

  const bookedSlots = new Set(await getBookedSlots(dateString));
  const allSlots = [];

  let startMinutes = timeToMinutes(hours.start);
  const endMinutes = timeToMinutes(hours.end);
  const now = new Date();

  if (dateString === formatDate(now)) {
    const nextHour = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 60) * 60;
    startMinutes = Math.max(startMinutes, nextHour);
  }

  for (let minutes = startMinutes; minutes < endMinutes; minutes += 60) {
    const slot = minutesToTime(minutes);
    if (!bookedSlots.has(slot)) {
      allSlots.push(slot);
    }
  }

  return allSlots;
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  const formData = new FormData(bookingForm);

  const booking = {
    id: createBookingId(),
    service: defaultServiceLabel,
    date: formData.get("bookingDate"),
    time: formData.get("bookingTime"),
    name: formData.get("customerName").trim(),
    phone: formData.get("customerPhone").trim(),
    email: formData.get("customerEmail").trim(),
    notes: formData.get("bookingNotes").trim(),
    createdAt: new Date().toISOString()
  };

  if (!booking.date || !booking.time || !booking.name || !booking.phone || !booking.email) {
    setFeedback("Please complete every required booking field.", "error");
    return;
  }

  bookingSubmitButton.disabled = true;
  bookingSubmitButton.textContent = "Saving...";

  try {
    if (isSupabaseMode) {
      await saveBookingToSharedBackend(booking);
      setFeedback("Your booking has been received. The Boss Look team will confirm your appointment by email.", "success");
    } else {
      saveBookingLocally(booking);
      setFeedback("Your booking has been received. The Boss Look team will confirm your appointment by email.", "success");
    }

    bookingForm.reset();
    setDateMinimum();
    await updateTimeOptions();
    if (bookingSummary || bookingsEmpty || bookingsList) {
      renderStorageState();
    }
  } catch (error) {
    console.error(error);
    setFeedback(
      error.message || "We could not submit your booking right now. Please try again or email thebosslookbarbers@gmail.com.",
      "error"
    );
  } finally {
    bookingSubmitButton.disabled = false;
    bookingSubmitButton.textContent = "Confirm Booking";
  }
}

function renderStorageState() {
  if (!bookingSummary && !bookingsEmpty && !bookingsList) {
    return;
  }

  if (isSupabaseMode) {
    bookingSummary.innerHTML =
      "<strong>Appointment confirmations are sent by email.</strong><span>Choose your time, submit your details, and wait for confirmation from The Boss Look.</span>";
    if (bookingsEmpty) {
      bookingsEmpty.hidden = true;
    }
    if (bookingsList) {
      bookingsList.innerHTML = "";
    }
    if (clearBookingsButton) {
      clearBookingsButton.hidden = true;
    }
    return;
  }

  const bookings = readLocalBookings().sort(compareBookings);
  if (bookingsList) {
    bookingsList.innerHTML = "";
  }
  if (clearBookingsButton) {
    clearBookingsButton.hidden = false;
  }

  if (!bookings.length) {
    if (bookingsEmpty) {
      bookingsEmpty.hidden = true;
    }
    bookingSummary.innerHTML =
      "<strong>Appointment confirmations are sent by email.</strong><span>Choose your time, submit your details, and wait for confirmation from The Boss Look.</span>";
    return;
  }

  if (bookingsEmpty) {
    bookingsEmpty.hidden = true;
  }
  bookingSummary.innerHTML =
    "<strong>Appointment request received.</strong><span>Your selected slot has been recorded for confirmation.</span>";

  bookings.forEach(function (booking) {
    if (!bookingsList) {
      return;
    }

    const entry = document.createElement("article");
    entry.className = "booking-entry";

    entry.innerHTML =
      '<div class="booking-entry-top"><strong>' +
      escapeHtml(booking.service) +
      "</strong><span>" +
      formatBookingDate(booking.date) +
      " at " +
      booking.time +
      "</span></div>" +
      "<p>" +
      escapeHtml(booking.name) +
      " | " +
      escapeHtml(booking.phone) +
      " | " +
      escapeHtml(booking.email) +
      "</p>" +
      "<span>" +
      (booking.notes ? escapeHtml(booking.notes) : "No extra notes added.") +
      "</span>";

    bookingsList.appendChild(entry);
  });
}

function clearBookings() {
  if (isSupabaseMode) {
    return;
  }

  if (!window.confirm("Clear all locally saved bookings from this browser?")) {
    return;
  }

  localStorage.removeItem(bookingStorageKey);
  if (bookingSummary || bookingsEmpty || bookingsList) {
    renderStorageState();
  }
  updateTimeOptions();
  setFeedback("Booking data was cleared from this browser.", "success");
}

async function getBookedSlots(dateString) {
  if (!isSupabaseMode) {
    return readLocalBookings()
      .filter(function (booking) {
        return booking.date === dateString;
      })
      .map(function (booking) {
        return booking.time;
      });
  }

  const response = await fetch(supabaseRpcUrl("booked_slots_for_date"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ requested_date: dateString })
  });

  if (!response.ok) {
    throw new Error("Could not load shared booking slots.");
  }

  const data = await response.json();
  return data.map(function (row) {
    return normalizeTime(row.booking_time);
  });
}

function saveBookingLocally(booking) {
  const existingBookings = readLocalBookings();
  const duplicate = existingBookings.some(function (existingBooking) {
    return existingBooking.date === booking.date && existingBooking.time === booking.time;
  });

  if (duplicate) {
    throw new Error("That slot has already been taken. Please choose a different time.");
  }

  existingBookings.push(booking);
  existingBookings.sort(compareBookings);
  localStorage.setItem(bookingStorageKey, JSON.stringify(existingBookings));
}

async function saveBookingToSupabase(booking) {
  const response = await fetch(supabaseTableUrl("appointments"), {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        service: booking.service,
        booking_date: booking.date,
        booking_time: booking.time + ":00",
        customer_name: booking.name,
        customer_phone: booking.phone,
        customer_email: booking.email,
        notes: booking.notes
      }
    ])
  });

  if (response.ok) {
    return;
  }

  const errorPayload = await safeJson(response);
  const message = extractSupabaseErrorMessage(errorPayload);

  if (message.includes("appointments_unique_slot") || message.includes("duplicate key")) {
    throw new Error("That slot has already been taken. Please choose a different time.");
  }

  throw new Error(message || "We could not submit your booking right now. Please try again shortly.");
}

async function saveBookingToSharedBackend(booking) {
  if (notificationMode === "edge-function") {
    await saveBookingViaNotificationFunction(booking);
    return;
  }

  await saveBookingToSupabase(booking);
}

async function saveBookingViaNotificationFunction(booking) {
  const response = await fetch(supabaseFunctionUrl(notificationFunctionName), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      service: booking.service,
      date: booking.date,
      time: booking.time,
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      notes: booking.notes
    })
  });

  if (response.ok) {
    return;
  }

  const errorPayload = await safeJson(response);
  const message = extractSupabaseErrorMessage(errorPayload);

  if (response.status === 409 || message.includes("appointments_active_slot_unique") || message.includes("duplicate key")) {
    throw new Error("That slot has already been taken. Please choose a different time.");
  }

  throw new Error(message || "We could not submit your booking right now. Please try again shortly.");
}

function readLocalBookings() {
  try {
    const storedBookings = localStorage.getItem(bookingStorageKey);
    return storedBookings ? JSON.parse(storedBookings) : [];
  } catch (error) {
    console.error("Failed to read local bookings", error);
    return [];
  }
}

function setFeedback(message, state) {
  feedback.textContent = message;
  if (state) {
    feedback.dataset.state = state;
  } else {
    delete feedback.dataset.state;
  }
}

function createBookingId() {
  return "booking-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
}

function compareBookings(left, right) {
  const leftValue = left.date + "T" + left.time;
  const rightValue = right.date + "T" + right.time;
  return leftValue.localeCompare(rightValue);
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function timeToMinutes(time) {
  const parts = normalizeTime(time).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function minutesToTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return hours + ":" + minutes;
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

function normalizeTime(time) {
  return String(time).slice(0, 5);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function supabaseHeaders() {
  return {
    apikey: bookingConfig.supabaseAnonKey,
    Authorization: "Bearer " + bookingConfig.supabaseAnonKey,
    "Content-Type": "application/json"
  };
}

function supabaseTableUrl(tableName) {
  return bookingConfig.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + tableName;
}

function supabaseRpcUrl(functionName) {
  return bookingConfig.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + functionName;
}

function supabaseFunctionUrl(functionName) {
  return bookingConfig.supabaseUrl.replace(/\/$/, "") + "/functions/v1/" + functionName;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

function extractSupabaseErrorMessage(payload) {
  return String(payload.message || payload.error_description || payload.error || "");
}
