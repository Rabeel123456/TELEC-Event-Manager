# TELEC Smart Event Manager Professional

Final online architecture:

- **GitHub:** source code and automatic deployments
- **Vercel:** website and secure server-side API
- **Supabase:** central events, users and activity-log database
- **Gemini:** secure poster reading through the Vercel API

Google Sheets and browser localStorage are not used as the event database.

## Required Vercel environment variables

Add these under **Vercel → Project → Settings → Environment Variables**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Never place secret values in frontend files or commit them to GitHub.

## Database setup

Open **Supabase → SQL Editor**, paste `supabase/schema.sql`, and click **Run**.
It is safe to run again because the script uses `if not exists`.

## GitHub/Vercel deployment

1. Upload all project files and folders to the root of the GitHub repository.
2. The following folder structure must remain intact:

   - `api/index.js`
   - `api/[...path].js`
   - `api/_handler.js`
   - `supabase/schema.sql`
   - `scripts/create-admin.mjs`

3. Commit the changes.
4. Vercel will automatically redeploy the connected repository.
5. If it does not, open **Vercel → Deployments → Redeploy**.

## First login

When the `profiles` table is empty, the first successful login automatically creates the administrator account.

- Username: `admin`
- Password: enter `Telec@2026` for initial setup

Change the default password for production use. New users can be created from **Users & Settings**.

## Poster reader reliability

- Images are compressed in the browser before upload to stay below Vercel request limits.
- The API checks models available to the configured Gemini key.
- It automatically tries compatible Flash models and retries temporary failures.
- Extracted information is shown in the editable event form before saving.
- If AI is unavailable, manual event entry and schedule-text parsing remain available.

## Main features

- Central multi-device event synchronization
- Admin, editor and viewer roles
- Event add, edit and delete
- Revision protection when two users edit the same event
- Duplicate event warning
- Today, Tomorrow, Next 7 Days and custom-date views
- Mobile Google Maps link access
- Poster event extraction
- Email/WhatsApp schedule text parser
- Activity log
- CSV export
