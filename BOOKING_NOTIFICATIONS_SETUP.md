# Booking Notifications Setup

This project now includes a Supabase Edge Function scaffold for booking notification emails.

Current status:
- booking notifications can run through the `booking-notifications` Edge Function
- admin booking changes can run through the `admin-appointment-actions` Edge Function
- customer and shop emails depend on your Resend and function-secret setup

## What the notification function does

When enabled, the `booking-notifications` function will:

1. receive the public booking payload
2. insert the booking into `public.appointments`
3. send a customer acknowledgement email
4. send an internal shop notification email

If email sending fails, the booking is still stored.

The admin dashboard now uses a second function, `admin-appointment-actions`, to:

1. update appointment statuses
2. send a cancellation email when an appointment is cancelled
3. remove past appointments from the dashboard safely

## Files involved

- `booking-config.js`
- `booking.js`
- `supabase/functions/booking-notifications/index.ts`
- `admin.js`
- `supabase/functions/admin-appointment-actions/index.ts`
- `supabase/functions/_shared/email-templates.ts`

## Recommended provider

Use Resend for the first version. It keeps the setup small and works well with Supabase Edge Functions.

## Supabase secrets to add

In Supabase, add these secrets for the Edge Function:

- `SUPABASE_SERVICE_ROLE_KEY` or `SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SHOP_NOTIFICATION_EMAILS`
- `BOOKING_NOTIFICATION_EMAILS_ENABLED`

Suggested values:

- `RESEND_FROM_EMAIL`:
  `The Boss Look <notifications@your-domain.com>`
- `SHOP_NOTIFICATION_EMAILS`:
  `thebosslookbarbers@gmail.com`
- `BOOKING_NOTIFICATION_EMAILS_ENABLED`:
  `false` during testing, then `true` when ready

If your Supabase dashboard only accepts `SERVICE_ROLE_KEY` in your workflow, that is fine. The function supports both names.

## Deploy the function

Deploy the Edge Function in Supabase as:

- function name: `booking-notifications`
- function name: `admin-appointment-actions`

The public site and admin dashboard expect those function names by default.

## Keep notifications off at first

In `booking-config.js`, keep:

```js
notificationMode: "disabled"
```

This means:
- public bookings use the normal direct booking save path
- no customer emails are sent yet
- admin cancellation emails stay off as well

## Turn it on later

Only after the function is deployed and tested:

1. Set the function secret:
   - `BOOKING_NOTIFICATION_EMAILS_ENABLED=true`
2. Update `booking-config.js`:

```js
notificationMode: "edge-function"
```

3. Deploy the updated site files
4. Submit a real test booking
5. Check:
   - booking saved in `appointments`
   - customer email received
   - internal shop email received
   - cancellation email received when an admin cancels a booking

## Suggested testing flow

Test in this order:

1. function deployed with `BOOKING_NOTIFICATION_EMAILS_ENABLED=false`
2. deploy both `booking-notifications` and `admin-appointment-actions`
3. switch local site config to `notificationMode: "edge-function"`
4. make sure bookings still save
5. enable email sending in the function secret
6. test with one real email address
7. cancel one test booking from the admin dashboard
8. only then push the notification-enabled config live

## What is still not built

This version covers:
- new booking acknowledgement
- internal shop alert
- cancellation email when admin cancels an appointment
- safe removal of past appointments from the admin dashboard

Still recommended for a future phase:
- send email when admin confirms a booking
- send reminder email before appointment time
