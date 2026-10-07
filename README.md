# SKFL · Shree Karni Fabcom Ltd

![SKFL](assets/brand/skfl-logo-fullhd.png)

App for **Shree Karni Fabcom Ltd (SKFL)** with **Tasks**, **Attendance** (clock in/out, breaks, leave, holidays), **Feedback** (questions, ideas, blockers) and **Live locations**.
Built with React Native + Expo (SDK 57, Expo Router) on Supabase (Postgres, Auth, Storage, Edge Functions).

Every permission is enforced in the database (row-level security and checked functions). The app screens only reflect what the server allows.

---

## Run it

```bash
npm install
npx expo start        # press w for web, or scan the QR code with Expo Go
```

`.env.local` already points at the SKFL Supabase project. It holds only the public (publishable) key. Never put the `service_role` key in the app.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (Expo config, React Compiler rules) |
| `npm run test:smoke` | 14 live checks against Supabase with the demo accounts (writes no data) |

### Demo accounts (password `Demo@2026`)

| Role | Email | Notes |
| --- | --- | --- |
| Boss | boss@example.com | Must set up 2FA (authenticator app) at first sign-in |
| HR | hr@example.com | Must set up 2FA |
| Manager | manager@example.com | Manages Neha, Karan, Sneha |
| Employee | neha@example.com | Also: karan@example.com, sneha@example.com |

In development the sign-in screen has one-tap buttons for these. **Delete these accounts before real use** (Supabase → Authentication → Users).

---

## How the app flows

1. **Loading screen**: the SKFL letters draw themselves in gold, then the company name and a progress bar appear while fonts load and the session is restored.
2. **Sign in**: email + password. Accounts are invite-only (the database rejects any sign-up without an invite).
3. **2FA**: Boss and HR enrol a TOTP authenticator and must verify each sign-in. The database refuses their actions on a non-2FA session.
4. **New password**: invited people replace their one-time password.
5. **Privacy notice** (DPDP Act): must be accepted before first use.
6. **Home**: different for each role.

| Area | Boss | HR | Manager | Employee |
| --- | --- | --- | --- | --- |
| Assign tasks | Anyone | Employees & HR | Own team | Personal to-dos |
| Employee details | Everything | Fields the Boss allows | Fields the Boss allows | Own profile |
| Feedback | All | All | Own team's & addressed to them | Own |

**Tasks:** Assigned → Accepted → In progress → (Blocked) → Submitted (with proof: comment, link or file) → Approved / Returned → Closed. Every change is timestamped. Blocking a task raises a blocker in Feedback.

**Feedback:** feedback, work questions, blockers. Optional anonymity (except blockers). Blockers escalate to HR after 4 h and the Boss after 24 h (configurable, runs every 15 min). Replies are stored on the item itself (`feedback_items.replies`).

---

## Brand

- The SKFL monogram is vector artwork in `src/components/brand/skflPaths.ts` (gold gradient, charcoal backgrounds).
- `npm run brand:assets` regenerates every image from it: app icon, Android adaptive icon layers, splash image, favicon, and Full HD logos in `assets/brand/` (`skfl-logo-fullhd.png` 1920×1080, `skfl-logo-transparent.png`, `skfl-logo.svg`).
- Theme colours live in `src/theme/tokens.ts`.

## Project structure

```
src/
  app/                    Expo Router screens
    _layout.tsx           fonts, providers, auth-state routing, animated splash
    sign-in, mfa, change-password, consent
    (app)/(tabs)/         home, tasks, attendance, feedback, more
    (app)/task, feedback, people, team, admin, holidays, notifications, location-sharing, app-lock
  components/             AnimatedSplash, Logo, cards, ui kit (primitives, forms, layout)
  providers/              AuthProvider (session, 2FA, timeout), ToastProvider
  lib/                    supabase client, typed API, types, formatting, CSV export, push
  theme/tokens.ts         colours, type scale, spacing, shadows
supabase/
  migrations/             001–008, applied to the project in order
  functions/              signup-start, onboarding-mail, activate-account, invite-user, password-reset
  tests/rls_role_tests.sql  28 role-by-role permission tests (runs in a rolled-back transaction)
  seed.sql                demo data
```

## Database tables

16 tables: `organizations, departments, users, employee_details, visibility_rules, auth_codes, app_settings, tasks, task_events, task_questions, feedback_items, attendance_records, holidays, location_points, notifications, audit_logs`

- RLS is on for every table. Clients get read access through policies. **All writes go through `security definer` functions** that check role, 2FA and business rules.
- `auth_codes` (activation keys and email / approver / reset codes, all hashed) has **no client access at all**.
- `employee_details` (salary, contact) is kept separate from `users` on purpose: `users` is readable by every employee.
- Departments are shared by every company. A person's company is `users.organization_id`. Names use `first_name` + `last_name` (no middle name).
- Scheduled jobs (pg_cron): blocker escalation (every 15 min), close missed attendance, location-point purge, and daily retention purge.

To re-run the permission tests, paste `supabase/tests/rls_role_tests.sql` into the SQL editor. The last query lists PASS/FAIL, and everything is rolled back.

---

## Check by hand (plain language)

1. **Employee (Neha):** sign in, accept the notice. Accept → Start → Submit the release-notes task with a comment. Add a personal to-do. Ask HR a question. Confirm you cannot see anyone's salary.
2. **Manager (Rohan):** approve or return Neha's task (a reason is required for return). Assign a task to Karan. Try to find HR in the assignee list (they are not there). Read the anonymous "stand-ups" feedback.
3. **HR (Priya):** set up 2FA. Answer Neha's question. Open Neha's profile: contact and attendance are visible, salary is hidden.
4. **Boss (Aarav):** set up 2FA. In Visibility settings, allow Managers to see attendance, then check Rohan now sees it. Invite a new person and sign in with the one-time password.
5. **Timeout:** leave the app idle for 30 minutes (configurable). It signs out.

---

## Before going live

- [ ] **Region:** the current project is in **Tokyo (ap-northeast-1)**. The requirement is Mumbai, and a region cannot be changed. Create a new project in `ap-south-1`, apply `supabase/migrations` in order, and update `.env.local`.
- [ ] Delete the demo accounts and demo data.
- [ ] Supabase → Auth: turn on **leaked password protection**, set the minimum password length to 10, disable public sign-ups, and configure SMTP for password-reset emails.
- [ ] Push notifications: run `npx eas-cli init` (adds the EAS project id), add FCM credentials for Android, and build with EAS. Push doesn't work in Expo Go on Android.
- [ ] Have an Indian employment lawyer review the privacy notice. Name a grievance officer.
- [ ] Optional hardening: store the session in an encrypted store (SecureStore-wrapped AsyncStorage) and add SMS OTP (needs an SMS provider).
