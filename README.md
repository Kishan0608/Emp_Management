# Emp Management

Employee management app with three modules: **Tasks**, **Complaints** (anonymous), and **Feedback** (questions, ideas, blockers).
Built with React Native + Expo (SDK 57, Expo Router) on Supabase (Postgres, Auth, Storage, Edge Functions).

Every permission is enforced in the database (row-level security and checked functions). The app screens only reflect what the server allows.

---

## Run it

```bash
npm install
npx expo start        # press w for web, or scan the QR code with Expo Go
```

`.env.local` already points at the **Emp_Managenment** Supabase project. It holds only the public (publishable) key. Never put the `service_role` key in the app.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (Expo config, React Compiler rules) |
| `npm run test:smoke` | 14 live checks against Supabase with the demo accounts (writes no data) |

### Demo accounts (password `Demo@2026`)

| Role | Email | Notes |
| --- | --- | --- |
| Boss | boss@example.com | Must set up 2FA (authenticator app) at first sign-in |
| HR | hr@example.com | Case handler + Internal Committee. Must set up 2FA |
| Manager | manager@example.com | Manages Neha, Karan, Sneha |
| Employee | neha@example.com | Also: karan@example.com, sneha@example.com |

In development the sign-in screen has one-tap buttons for these. **Delete these accounts before real use** (Supabase → Authentication → Users).

---

## How the app flows

1. **Loading screen**: animated brand splash while fonts load and the session is restored.
2. **Sign in**: email + password. Accounts are invite-only (the database rejects any sign-up without an invite).
3. **2FA**: Boss and HR enrol a TOTP authenticator and must verify each sign-in. The database refuses their actions on a non-2FA session.
4. **New password**: invited people replace their one-time password.
5. **Privacy notice** (DPDP Act): must be accepted before first use.
6. **Home**: different for each role.

| Area | Boss | HR | Manager | Employee |
| --- | --- | --- | --- | --- |
| Assign tasks | Anyone | Employees & HR | Own team | Personal to-dos |
| Employee details | Everything | Fields the Boss allows | Fields the Boss allows | Own profile |
| Complaint counts | Yes (numbers only) | Case handler | – | – |
| Complaint text | **Never** | Case handler only | – | – |
| Feedback | All | All | Own team's & addressed to them | Own + Q&A board |
| Disciplinary cases | Open, decide penalty, terminate | Run inquiry stages | – | Own case after notice |

**Tasks:** Assigned → Accepted → In progress → (Blocked) → Submitted (with proof: comment, link or file) → Approved / Returned → Closed. Every change is timestamped. Blocking a task raises a blocker in Feedback.

**Feedback:** feedback, work questions, blockers. Optional anonymity (except blockers). Blockers escalate to HR after 4 h and the Boss after 24 h (configurable, runs every 15 min). Answered questions can be published to a Q&A board. If the text looks like a complaint about a person, the app suggests using Complaints instead.

**Complaints:**
- Filed through the `submit-complaint` Edge Function. The database stores no author.
- Counts: yellow at 3+ **different people**, red at 5+, within 90 days. Complaints HR tags as duplicate, unsubstantiated or malicious don't count. All thresholds are configurable.
- Red lets the Boss open a case: preliminary inquiry → show-cause → employee reply (at least 7 days) → domestic inquiry → findings → penalty (Boss) → written order (Boss) → **Terminate** (only now, with name confirmation). Nothing is automatic.
- Sexual harassment goes to a separate **confidential** (named) POSH form, readable only by Internal Committee members.

---

## Project structure

```
src/
  app/                    Expo Router screens
    _layout.tsx           fonts, providers, auth-state routing, animated splash
    sign-in, mfa, change-password, consent
    (app)/(tabs)/         home, tasks, feedback, complaints, more
    (app)/task, feedback, complaint, case, people, admin, notifications
  components/             AnimatedSplash, Logo, cards, ui kit (primitives, forms, layout)
  providers/              AuthProvider (session, 2FA, timeout), ToastProvider
  lib/                    supabase client, typed API, types, formatting, CSV export, push
  theme/tokens.ts         colours, type scale, spacing, shadows
supabase/
  migrations/             001–008, applied to the project in order
  functions/              submit-complaint, invite-user
  tests/rls_role_tests.sql  76 role-by-role permission tests (runs in a rolled-back transaction)
  seed.sql                demo data
```

## Database tables

`app_settings, departments, users, employee_details, visibility_rules, tasks, task_events, feedback_items, feedback_replies, complaints, complaint_counts, complaint_quota, disciplinary_cases, case_documents, committee_members, confidential_reports, notifications, audit_logs`

- RLS is on for every table. Clients get read access through policies. **All writes go through `security definer` functions** that check role, 2FA and business rules.
- `complaints`, `complaint_quota` and `confidential_reports` have **no client access at all**.
- Complaint and POSH text is encrypted with `pgp_sym_encrypt`. Keys are in Supabase Vault.
- Scheduled jobs (pg_cron): blocker escalation (every 15 min), daily flag digest, and daily retention purge.

To re-run the permission tests, paste `supabase/tests/rls_role_tests.sql` into the SQL editor. The last query lists PASS/FAIL, and everything is rolled back.

---

## Where a complaint author could leak, and how it is closed

| Place | Risk | How it's closed |
| --- | --- | --- |
| Complaint row | Author column | None exists. Only target, category, encrypted text, date, dedupe hash |
| Timestamps | Exact time matched to who was online | Date only, no `created_at`. `complaint_counts` stores a date, not a time |
| Notifications | "New complaint" alert time = submit time | No alert on submit. Flag alerts go out in a **daily batch** (`daily_flag_digest`) |
| Quota table | Joining quota rows to complaints | Stores user + month + count only, no target |
| Dedupe hash | Reversing who wrote it | Keyed HMAC. The key is in Vault, not in the table or the app |
| API / DB logs | Logs showing which user wrote to `complaints` | The app never touches the table. The Edge Function writes as `service_role`, logs nothing about the user, and the RPC has no client grant |
| HR inbox | Handler sees author | The function returns no author or hash (tested). Views are audited |
| Complaints about the handler | Handler reads complaints about themselves | Filtered out server-side |
| Small teams | Guessing by elimination | Warning when the team is under 5 (configurable) |
| Writing style | Text identifies the writer | In-app warning before submitting |
| Admin access | Project owner can read Vault and the database | **Organisational control**: the Boss must not own the Supabase project. Use a separate technical admin, enable Supabase audit logs, and restrict dashboard access |
| Backups | Backups contain the data | Backups contain no author either. Retention purge deletes old rows |

---

## Check by hand (plain language)

1. **Employee (Neha):** sign in, accept the notice. Accept → Start → Submit the release-notes task with a comment. Add a personal to-do. Ask HR a question. File an anonymous complaint about Karan. Confirm you cannot see anyone's salary.
2. **Manager (Rohan):** approve or return Neha's task (a reason is required for return). Assign a task to Karan. Try to find HR in the assignee list (they are not there). Read the anonymous "stand-ups" feedback.
3. **HR (Priya):** set up 2FA. Open Triage and tag Neha's complaint. Confirm the inbox shows text but no author. Open Neha's profile: contact and attendance are visible, salary is hidden.
4. **Boss (Aarav):** set up 2FA. Complaints tab shows **numbers only**. In Visibility settings, allow Managers to see attendance, then check Rohan now sees it. Invite a new person and sign in with the one-time password.
5. **Disciplinary flow:** file complaints about one person from 5 different accounts (the quota is 3 per person per month). The next day's digest, or the counts screen, shows red. Open a case and walk through the stages. Terminate stays locked until the written order.
6. **Timeout:** leave the app idle for 30 minutes (configurable). It signs out.

---

## Before going live

- [ ] **Region:** the current project is in **Tokyo (ap-northeast-1)**. The requirement is Mumbai, and a region cannot be changed. Create a new project in `ap-south-1`, apply `supabase/migrations` in order, and update `.env.local`.
- [ ] Delete the demo accounts and demo data.
- [ ] Supabase → Auth: turn on **leaked password protection**, set the minimum password length to 10, disable public sign-ups, and configure SMTP for password-reset emails.
- [ ] Push notifications: run `npx eas-cli init` (adds the EAS project id), add FCM credentials for Android, and build with EAS. Push doesn't work in Expo Go on Android.
- [ ] Have an Indian employment lawyer review the complaint thresholds, the case stages and the privacy notice. Name a grievance officer.
- [ ] Penetration test the complaint module.
- [ ] Optional hardening: store the session in an encrypted store (SecureStore-wrapped AsyncStorage) and add SMS OTP (needs an SMS provider).
