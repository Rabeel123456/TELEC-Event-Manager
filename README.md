# TELEC Smart Event Manager Professional

Production-ready architecture:
- GitHub: source control
- Vercel: secure frontend and serverless API
- Supabase: central database and authentication
- Gemini: secure server-side poster extraction with automatic compatible-model detection and fallback

## Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` values into local environment and Vercel Environment Variables.
4. Run `npm install`.
5. Create the first administrator:
   `npm run create-admin`
6. Push the folder to a GitHub repository.
7. Import that repository into Vercel and deploy.

## Required Vercel Environment Variables
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- GEMINI_API_KEY

Never place service-role or Gemini keys in frontend files or commit them to GitHub.

## First Login
Username and password are set when running `npm run create-admin`.
Defaults: `admin` / `Telec@2026`. Change the password before production use.
