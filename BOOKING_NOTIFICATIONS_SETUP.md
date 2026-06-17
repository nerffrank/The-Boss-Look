# Booking Notifications Setup

This project now includes a Supabase Edge Function scaffold for booking notification emails.

Current status:
- booking notifications are **built but disabled**
- the live website still saves bookings directly into Supabase
- no automatic emails are sent until you finish provider setup and switch the config on

## What the notification function does

When enabled, the `booking-notifications` function will:

1. receive the public booking payload
2. insert the booking into `public.appointments`
3. send a customer acknowledgement email
4. send an internal shop notification email

If email sending fails, the booking is still stored.

## Files involved

- `booking-config.js`
- `booking.js`
- `supabase/functions/booking-notifications/index.ts`

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
  `aidoofrank907@gmail.com,thebosslookbarbers@gmail.com`
- `BOOKING_NOTIFICATION_EMAILS_ENABLED`:
  `false` during testing, then `true` when ready

If your Supabase dashboard only accepts `SERVICE_ROLE_KEY` in your workflow, that is fine. The function supports both names.

## Deploy the function

Deploy the Edge Function in Supabase as:

- function name: `booking-notifications`

The public site expects that function name by default.

## Keep notifications off at first

In `booking-config.js`, keep:

```js
notificationMode: "disabled"
```

This means:
- public bookings keep using the current direct database insert
- no customer emails are sent yet
- nothing changes for live users

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

## Suggested testing flow

Test in this order:

1. function deployed with `BOOKING_NOTIFICATION_EMAILS_ENABLED=false`
2. switch local site config to `notificationMode: "edge-function"`
3. make sure bookings still save
4. enable email sending in the function secret
5. test with one real email address
6. only then push the notification-enabled config live

## What is still not built

This first version only covers:
- new booking acknowledgement
- internal shop alert

Still recommended for phase two:
- send email when admin confirms a booking
- send email when admin cancels a booking
- send reminder email before appointment time
