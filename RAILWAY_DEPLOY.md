# GeoPartners on Railway

## Services

Create four services in one Railway project:

1. `web`: this GitHub repository, using `/railway.json`.
2. `postgres`: Railway PostgreSQL.
3. `notifications`: the same repository, using `/railway.notifications.json` as the config file path.
4. `backup`: the same repository, using `/railway.backup.json` as the config file path.

Add a Railway Storage Bucket and expose its generated S3 variables to the `backup` service. Railway cron expressions use UTC. Notifications run every five minutes; the database backup runs each Sunday at 02:00 UTC and deletes backup objects older than 90 days.

## Current staging

- Railway project: `GeoPartners` (`38fb9a77-6b1c-436d-b3ca-b74f857f3934`).
- Environment: `staging`, region `EU West`.
- Application: `https://geopartners-web-staging.up.railway.app`.
- Services: `geopartners-web`, `Postgres`, `geopartners-backup`, `geopartners-notifications`, and staging-only `mailpit`.
- Bucket: `geopartners-documents`, region `ams`.

The staging web, notification, and backup services deploy automatically from the `staging` branch. Their Railway config paths are `/railway.json`, `/railway.notifications.json`, and `/railway.backup.json` respectively. Direct `railway up` uploads are reserved for recovery when the GitHub integration is unavailable.

## Current production

- Environment: `production`.
- Application: `https://geopartners-web-production.up.railway.app`.
- Source: `Yadro13/GeoPartners`, branch `main`.
- Services: `geopartners-web`, `geopartners-notifications`, `geopartners-backup`, PostgreSQL, Mailpit, and an isolated Bucket instance.
- Automatic deploys: enabled for web, notifications, and backup; each service uses its dedicated Railway config file.
- GitHub App repository access and the `main` branch triggers were verified on 2026-07-23.

Production was created from the staging configuration on 2026-07-23. PostgreSQL data and Bucket objects remain isolated between environments. The Railway production domain is active and is configured as `APP_URL` and `BETTER_AUTH_URL`.

## Release strategy

- `staging` is the active development, integration, and acceptance environment.
- The Git branch `staging` is the source for automatic staging deployments.
- The Git branch `main` is the source for automatic production deployments and remains frozen between approved releases.
- Tested code is promoted from `staging` to `main` only after the relevant staging acceptance checks pass.
- Production PostgreSQL and Bucket data are not synchronized continuously.
- The final staging-to-production data transfer will run only after the customer resolves the open overlap, report, and domain questions and the resulting changes pass staging acceptance.
- The transfer must include PostgreSQL records and referenced Bucket objects, followed by production authentication, notification, document, report, and backup checks.

The active staging SMTP relay is Brevo in both the web and notification services. Mailpit remains as a private staging-only service until the password-reset flow has also been exercised against Brevo; it is no longer referenced by the active application SMTP variables. Google OAuth and the private Telegram administrator channel are configured for staging.

The initial migration, password registration, email verification, pending-approval gate, administrator notification, notification dispatcher, and a real PostgreSQL backup upload were verified on 2026-07-21. On 2026-07-22 the complete staging registration flow was verified again with Brevo and Telegram: email verification, pending access, administrator email and Telegram notification, protected review page, approval with a comment, and the decision email. The temporary user and its database records were removed after verification.

On 2026-07-23 the password-reset request was accepted by staging through the real Brevo relay with no delivery error in application logs. The newest Bucket archive was inspected successfully, then restored into a disposable sibling PostgreSQL database; all required tables were verified and the temporary database was removed.

## Web variables

Copy the names from `.env.example` into the `web` service and set production values. In particular:

- `APP_URL` and `BETTER_AUTH_URL`: the final HTTPS origin, without a trailing slash.
- `BETTER_AUTH_SECRET`: a random secret of at least 32 characters.
- `ADMIN_EMAIL`: the account that receives the administrator role.
- `DATABASE_URL`: a reference to the PostgreSQL service variable.
- `SMTP_*`: the transactional mail provider credentials.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Google OAuth application credentials.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID`: optional second notification channel.

The Google OAuth authorized redirect URI is:

```text
https://YOUR_DOMAIN/api/auth/callback/google
```

The `notifications` service needs `DATABASE_URL`, `APP_URL`, `ADMIN_EMAIL`, all `SMTP_*` variables, and the optional Telegram variables. The `backup` service needs `DATABASE_URL` and the six `AWS_*` variables generated by the Railway Bucket.

The `web` service also needs the six Bucket `AWS_*` variables to store uploaded land documents. Without them, PDF storage is available only in local development and production imports containing PDF files are rejected.

## Plot document import

Upload GeoJSON and PDF files together. Files with the same base name are paired first, and the cadastral numbers extracted from both sources are then compared. Coordinates come from the GeoJSON geometry; cadastral number, area, owner, and lessee come from the PDF. A mismatch blocks that pair instead of saving uncertain data.

Each file is limited to 20 MB and each request to 60 files. Accepted formats are `.geojson`, `.json`, and `.pdf`.

## Plot version history

Updates, imports, and deletions store the previous plot state in PostgreSQL. Administrators can restore an available version from the audit log; cadastral duplicates, invalid geometry, and overlaps are checked again before restoration.

PDF objects referenced by older plot versions are retained in the Railway Bucket so that restoring a version can also restore its document. Do not add a short bucket lifecycle rule for the `plots/` prefix. Database backups continue to use their separate 90-day retention policy.

## Data workspaces

The application keeps `production` and `sandbox` data workspaces in the same Railway PostgreSQL service. Plot IDs, cadastral-number uniqueness, categories, documents, audit entries, and stored plot versions are scoped to the selected workspace. Existing records are assigned to `production` by migration.

All approved users can switch between the work and test databases when the global test-workspace setting is enabled. The selection is stored in an HTTP-only cookie and every server query resolves the workspace independently; changing the label in the browser cannot bypass the server scope.

Only an administrator can show or hide the test database and clear all sandbox plots, categories, documents, and audit history. When the setting is off, the server forces `production` for every user and the workspace indicator is removed from both desktop and mobile interfaces.

## Roles and permissions

- `user`: view the map and audit log, create and edit plots, toggle local layer visibility, generate reports, export data, download documents, and manage their own profile.
- `admin`: all user permissions plus bulk GeoJSON/PDF import, plot deletion, version restoration, shared category management, registration approval, and user administration.

The same permissions are enforced by API routes. Hiding a command in the interface is not used as the authorization boundary.

## Authentication integrations

Google OAuth is enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. Use separate OAuth clients for staging and production, with the following staging redirect URI:

```text
https://geopartners-web-staging.up.railway.app/api/auth/callback/google
```

The configured `ADMIN_EMAIL` is password-only and is rejected by the Google provider. Implicit account linking by matching email is disabled. An approved password user can explicitly connect Google from their profile; a new Google user follows the normal pending registration and administrator approval flow.

For free transactional SMTP, the recommended staging and initial production provider is Brevo:

```text
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
```

Use a Brevo SMTP key as `SMTP_PASSWORD`, not the Brevo account password. A verified individual sender can be used before the final domain is selected. After domain selection, authenticate the sending domain with DKIM and DMARC and update `SMTP_FROM` to the domain sender.

Telegram remains an outbound-only notification channel. Create a bot and private administrator group, then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID`. No webhook or additional Railway service is required. Registration messages include a URL button that opens the protected review page; approval and rejection still require an authenticated administrator session in GeoPartners.

Keep staging Mailpit private until Brevo has passed the remaining password-reset email test. Registration and moderation messages already use Brevo in both `geopartners-web` and `geopartners-notifications`.

## Backup verification and restore

Every generated dump is inspected with `pg_restore --list` before it is uploaded. To validate the newest object manually, run `npm run backup:verify` in the backup service environment.

Restores must target a separate recovery database. Set `RESTORE_DATABASE_URL` and repeat its database name in `RESTORE_CONFIRM_DATABASE`, then run `npm run backup:restore -- --key OBJECT_KEY`. The command refuses to restore over the configured `DATABASE_URL`. See `docs/BACKUP_RESTORE.md` for the complete drill and recovery procedure.

For a disposable technical restore drill, run `npm run backup:drill` inside a service that has both database and Bucket variables. It creates a temporary sibling database, restores and verifies the newest archive, then removes the temporary database.

## Domain

Generate a Railway domain first and confirm `/api/health` returns `ok`. Then add the custom domain in the `web` service Networking settings. Railway will display the required DNS records, normally a CNAME and ownership TXT record, and will issue the TLS certificate automatically after DNS validation.

After changing the domain, update `APP_URL`, `BETTER_AUTH_URL`, the Google OAuth origin, and the Google OAuth redirect URI, then redeploy the web service.

## First administrator

Set `ADMIN_EMAIL` before the first sign-in. Register that exact address with email and password, confirm the verification email, and it will be approved with the administrator role. Other registrations remain pending until approved or rejected from `/admin/registrations`.
