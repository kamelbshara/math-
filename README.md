# Polynomials LMS — Khaled bin Alwaleed School

A lightweight learning-management platform for the Grade 10 Polynomials module — student portal, admin console, database, and auth, all backed by Supabase and deployed as static files.

**Live site:** https://kbaw-polynomials-lms.vercel.app

## Files

| File | Purpose |
|---|---|
| `index.html` | Login page (username/password) |
| `student.html` + `student.js` | Student portal — Alef-style chapter cards with nested lessons, learning outcomes, questions with images, wrong-answer feedback, video-view tracking, forced password change on first login |
| `admin.html` + `admin.js` | Admin console — Users, Classrooms, Chapters & Lessons (with cover images + learning outcomes), Question Bank (with images + per-choice feedback + print worksheets), Resources, Analytics (per-student drill-down), Audit Log |
| `config.js` | Shared Supabase client config + auth helpers used by all pages |

No build step — plain HTML/CSS/JS, deployed as static files (currently via Vercel).

## Backend (Supabase)

Project ref: `iokqrdqmlrculyyxsufw`

### Schema (public tables)
- `classrooms`, `profiles` (linked to `auth.users`), `chapters` (+ `cover_image_url`), `lessons`, `learning_outcomes`, `lesson_resources`, `questions` (+ `image_url`), `choices` (+ `explanation`), `student_progress`, `video_views`, `audit_log`

### Storage buckets
- `question-images` — public read, admin-only write
- `chapter-covers` — public read, admin-only write

### Edge Function: `admin-users`
Handles privileged operations that need the service-role key: `create_user`, `bulk_create`, `delete_user`, `set_active`, `reset_password`, `update_profile`. All admin actions are written to `audit_log`.

### Security model
- Row-Level Security everywhere; `is_admin()` helper gates all writes
- Students can only read/write their own `student_progress` and `video_views`, and can only flip their own `must_change_password` flag
- Login uses synthetic emails (`username@kbaw.internal`) resolved via the `get_login_email()` RPC, since students authenticate by username, not email
- All admin-created accounts require a password change on first login (`profiles.must_change_password`)

## Admin login
Username: `kamel` — password set separately (not stored in this repo).

## Local development
No build tooling required — open `index.html` directly, or serve the folder with any static file server. All backend calls go straight to the Supabase project above via `config.js`.
