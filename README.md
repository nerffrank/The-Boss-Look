# The Boss Look

Official website source for The Boss Look barber shop.

## Live site contents

- `index.html` - main site structure
- `styles.css` - site styling
- `logo.png.png` - primary logo asset
- `logo-cropped.png` - cropped logo asset

## Booking

The site now includes a first-party booking flow directly on the page.

Current booking scope:
- date and time slot selection
- customer detail capture
- duplicate-slot prevention
- local test mode for browser-only storage
- shared backend mode via Supabase when configured
- admin dashboard entry point at `admin.html`
- notification-ready booking flow scaffold for future email automation

## Shared backend setup

To switch from browser-local bookings to a shared live booking system:

1. Create a Supabase project
2. Run `supabase-schema.sql` in the Supabase SQL editor
3. Open `booking-config.js`
4. Change:
   - `provider` to `"supabase"`
   - `supabaseUrl` to your project URL
   - `supabaseAnonKey` to your public anon key
   - `adminEmail` to the email allowed to use the admin dashboard
   - keep `notificationMode` set to `"disabled"` until the email flow has been tested
5. Deploy the updated files

Once that is done:
- the public booking form will save into Supabase
- booked slots will block across devices
- the public site will stop showing the local test dashboard contents

## Admin dashboard setup

To enable the private admin dashboard:

1. Open `supabase-admin-upgrade.sql`
2. Run it in the Supabase SQL editor
3. Open `admin.html`
4. Sign in with one of the configured admin emails using password login
5. Use the reset-link button on `admin.html` the first time an admin password needs to be created

The admin dashboard lets the shop:
- review all bookings
- filter by date and status
- update bookings to pending, confirmed, completed, or cancelled

## Booking notifications

The repo now includes a disabled-by-default notification path using a Supabase Edge Function.

Relevant files:
- `BOOKING_NOTIFICATIONS_SETUP.md`
- `supabase/functions/booking-notifications/index.ts`

This future rollout will allow:
- booking save into Supabase
- customer acknowledgement email
- internal shop notification email

Keep it disabled until the notification provider and function are fully tested.

## Notes

Client phone number and email are currently placeholders and can be updated once confirmed.
Before launch, shared backend mode should be enabled in `booking-config.js`.
Before turning on automated booking emails, complete the steps in `BOOKING_NOTIFICATIONS_SETUP.md`.
