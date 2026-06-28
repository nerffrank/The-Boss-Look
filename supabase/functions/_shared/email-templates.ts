export const SHOP_NAME = "The Boss Look";
export const SHOP_WEBSITE = "https://thebosslookgh.com";
export const SHOP_PHONE = "0502963295";

export type AppointmentEmailData = {
  service: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notes?: string;
  status?: string;
};

export function buildBookingCustomerEmail(appointment: AppointmentEmailData) {
  const title = "Your booking request is in";
  const intro =
    "Thanks for booking with The Boss Look. We have received your appointment request and the team will confirm your slot by email.";
  const detailRows = [
    ["Date", formatDisplayDate(appointment.booking_date)],
    ["Time", normalizeTime(appointment.booking_time)],
    ["Service", appointment.service || "In-shop consultation"],
    ["Phone", SHOP_PHONE]
  ];

  return {
    subject: "We received your booking request - The Boss Look",
    html: buildEmailShell({
      preheader: "Your booking request has been received by The Boss Look.",
      eyebrow: "Booking received",
      title,
      greeting: `Hi ${escapeHtml(appointment.customer_name)},`,
      intro,
      detailRows,
      bodyHtml:
        "<p style=\"margin:0 0 12px;\">Please make sure your details are correct and arrive on time for your selected slot.</p>" +
        `<p style="margin:0 0 12px;">If you need help before your appointment, call us on <strong>${escapeHtml(
          SHOP_PHONE
        )}</strong> or reply to this email.</p>`,
      footerNote: "The Boss Look team will confirm your booking shortly."
    }),
    text: [
      `${SHOP_NAME}`,
      "",
      `Hi ${appointment.customer_name},`,
      "",
      "We have received your booking request and the team will confirm your slot by email.",
      "",
      `Date: ${formatDisplayDate(appointment.booking_date)}`,
      `Time: ${normalizeTime(appointment.booking_time)}`,
      `Service: ${appointment.service || "In-shop consultation"}`,
      `Phone: ${SHOP_PHONE}`,
      "",
      "Please make sure your details are correct and arrive on time for your selected slot.",
      `If you need help before your appointment, call us on ${SHOP_PHONE} or reply to this email.`
    ].join("\n")
  };
}

export function buildCancellationCustomerEmail(appointment: AppointmentEmailData) {
  const title = "Your booking has been cancelled";
  const intro =
    "Your appointment at The Boss Look is no longer active. If you still want to come in, you can book another slot and the team will help you from there.";
  const detailRows = [
    ["Date", formatDisplayDate(appointment.booking_date)],
    ["Time", normalizeTime(appointment.booking_time)],
    ["Service", appointment.service || "In-shop consultation"],
    ["Phone", SHOP_PHONE]
  ];

  return {
    subject: "Your booking at The Boss Look was cancelled",
    html: buildEmailShell({
      preheader: "Your booking at The Boss Look has been cancelled.",
      eyebrow: "Booking update",
      title,
      greeting: `Hi ${escapeHtml(appointment.customer_name)},`,
      intro,
      detailRows,
      bodyHtml:
        "<p style=\"margin:0 0 12px;\">If this cancellation was unexpected, please reply to this email or call the shop and we will help you rebook.</p>" +
        `<p style="margin:0 0 12px;"><strong>Phone:</strong> ${escapeHtml(
          SHOP_PHONE
        )}</p><p style="margin:0;">Website: <a href="${SHOP_WEBSITE}" style="color:#d5a15a;text-decoration:none;">${SHOP_WEBSITE}</a></p>`,
      footerNote: "Thank you for choosing The Boss Look."
    }),
    text: [
      `${SHOP_NAME}`,
      "",
      `Hi ${appointment.customer_name},`,
      "",
      "Your appointment at The Boss Look has been cancelled.",
      "",
      `Date: ${formatDisplayDate(appointment.booking_date)}`,
      `Time: ${normalizeTime(appointment.booking_time)}`,
      `Service: ${appointment.service || "In-shop consultation"}`,
      "",
      `If this cancellation was unexpected, please reply to this email or call ${SHOP_PHONE}.`,
      `Website: ${SHOP_WEBSITE}`
    ].join("\n")
  };
}

export function buildShopBookingAlertEmail(appointment: AppointmentEmailData) {
  const title = "New booking request";
  const intro = "A new appointment request has been created on the website.";
  const detailRows = [
    ["Client", appointment.customer_name],
    ["Email", appointment.customer_email],
    ["Phone", appointment.customer_phone],
    ["Date", formatDisplayDate(appointment.booking_date)],
    ["Time", normalizeTime(appointment.booking_time)],
    ["Service", appointment.service || "In-shop consultation"],
    ["Notes", appointment.notes || "No notes provided."]
  ];

  return {
    subject: "New booking request - The Boss Look",
    html: buildEmailShell({
      preheader: "A new booking request has been created on the website.",
      eyebrow: "Shop alert",
      title,
      greeting: "Hello team,",
      intro,
      detailRows,
      bodyHtml:
        "<p style=\"margin:0;\">Open the admin dashboard to review and manage the appointment.</p>",
      footerNote: "This notification was sent automatically from the booking system."
    }),
    text: [
      `${SHOP_NAME} - New booking request`,
      "",
      `Client: ${appointment.customer_name}`,
      `Email: ${appointment.customer_email}`,
      `Phone: ${appointment.customer_phone}`,
      `Date: ${formatDisplayDate(appointment.booking_date)}`,
      `Time: ${normalizeTime(appointment.booking_time)}`,
      `Service: ${appointment.service || "In-shop consultation"}`,
      `Notes: ${appointment.notes || "No notes provided."}`
    ].join("\n")
  };
}

export function normalizeTime(value: string) {
  return String(value || "").slice(0, 5);
}

export function formatDisplayDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ShellOptions = {
  preheader: string;
  eyebrow: string;
  title: string;
  greeting: string;
  intro: string;
  detailRows: Array<[string, string]>;
  bodyHtml: string;
  footerNote: string;
};

function buildEmailShell(options: ShellOptions) {
  const detailRowsHtml = options.detailRows
    .map(([label, value]) => {
      return (
        "<tr>" +
        `<td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#bdb6ab;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(
          label
        )}</td>` +
        `<td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#f7f1e8;font-size:15px;font-weight:600;text-align:right;">${escapeHtml(
          value
        )}</td>` +
        "</tr>"
      );
    })
    .join("");

  return (
    "<!DOCTYPE html>" +
    '<html lang="en">' +
    "<head>" +
    '<meta charset="UTF-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
    `<title>${escapeHtml(options.title)} - ${SHOP_NAME}</title>` +
    "</head>" +
    '<body style="margin:0;padding:0;background:#0f0f10;color:#f7f1e8;font-family:Arial,Helvetica,sans-serif;">' +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>` +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0f10;padding:24px 12px;">' +
    "<tr>" +
    '<td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#171514;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;">' +
    "<tr>" +
    '<td style="padding:28px 28px 18px;background:linear-gradient(135deg,#251d12 0%,#171514 100%);border-bottom:1px solid rgba(255,255,255,0.08);">' +
    `<p style="margin:0 0 10px;color:#d5a15a;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;">${escapeHtml(
      options.eyebrow
    )}</p>` +
    `<h1 style="margin:0;color:#f7f1e8;font-size:34px;line-height:1.05;font-weight:800;">${escapeHtml(
      options.title
    )}</h1>` +
    `<p style="margin:14px 0 0;color:#cfc7bc;font-size:16px;line-height:1.7;">${options.greeting}</p>` +
    "</td>" +
    "</tr>" +
    "<tr>" +
    '<td style="padding:28px;">' +
    `<p style="margin:0 0 18px;color:#ddd5ca;font-size:16px;line-height:1.75;">${escapeHtml(
      options.intro
    )}</p>` +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;padding:18px 20px;background:#111111;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
    detailRowsHtml +
    "</table>" +
    `<div style="color:#ddd5ca;font-size:15px;line-height:1.75;">${options.bodyHtml}</div>` +
    "</td>" +
    "</tr>" +
    "<tr>" +
    '<td style="padding:20px 28px 28px;border-top:1px solid rgba(255,255,255,0.08);">' +
    `<p style="margin:0 0 8px;color:#f7f1e8;font-size:14px;font-weight:700;">${SHOP_NAME}</p>` +
    `<p style="margin:0;color:#aaa296;font-size:13px;line-height:1.7;">${escapeHtml(options.footerNote)}<br />Dome, Accra | Phone: ${escapeHtml(
      SHOP_PHONE
    )}</p>` +
    "</td>" +
    "</tr>" +
    "</table>" +
    "</td>" +
    "</tr>" +
    "</table>" +
    "</body>" +
    "</html>"
  );
}
