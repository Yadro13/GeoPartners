# План розгортання production в Railway-акаунті замовника

Дата актуалізації: 24 липня 2026 року.

Цей документ описує перенесення перевіреного GeoPartners staging у новий
Railway-проєкт на тарифі Hobby, власником і платником якого є замовник.
Поточний технічний production команди не використовується як фінальний.

## Коротка відповідь

Так, **код і наступні релізи передаються через GitHub**:

```text
розробка -> staging -> Pull Request -> main -> Railway production
```

Через GitHub не передаються:

- PostgreSQL і його записи;
- PDF та backup-архіви у Railway Bucket;
- секрети Railway;
- домен і DNS;
- Google OAuth, Brevo та Telegram credentials.

Ці складові створюються або переносяться окремо за контрольованою процедурою.

## Цільова схема

```text
Yadro13/GeoPartners:main
        |
        +--> geopartners-web --------> PostgreSQL
        |          |
        |          +-----------------> Railway Bucket
        |
        +--> geopartners-notifications
        |          |
        |          +-----------------> Brevo HTTPS API
        |          +-----------------> Telegram Bot API
        |
        +--> geopartners-backup -----> Railway Bucket
```

У production не створюється Mailpit. Усі сервіси розміщуються в одному
Railway-проєкті й одному environment `production`.

## Власність і доступи

### Замовник

- створює Railway-акаунт, активує Hobby і є власником billing;
- створює production-проєкт або запрошує команду створити його у своєму workspace;
- зберігає контроль над доменом, DNS, Brevo, Google OAuth і Telegram;
- має GitHub-доступ до `Yadro13/GeoPartners`;
- після приймання може видалити тимчасовий доступ команди до Railway.

### Команда

- готує реліз у GitHub;
- налаштовує сервіси, variables, домен і інтеграції в Railway;
- виконує репетицію та фінальне перенесення даних;
- проводить production-перевірку й передає runbook замовнику.

Для GitHub autodeploy хоча б один учасник Railway-проєкту повинен мати
підключений GitHub-акаунт із contributor-доступом до репозиторію. Railway
GitHub App також має отримати доступ до `Yadro13/GeoPartners`.

Передавати репозиторій іншому GitHub-власнику для запуску не потрібно.
Можливе майбутнє перенесення репозиторію до організації замовника оформлюється
окремо; після нього джерело кожного Railway-сервісу треба перепідключити й
повторно перевірити autodeploy.

## Етап 1. Підготовка релізу в GitHub

1. Завершити відкриті роботи щодо звіту й домену.
2. Пройти актуальний staging acceptance checklist.
3. Зафіксувати вікно релізу та тимчасово припинити зміни у `staging`.
4. Створити Pull Request `staging -> main`.
5. Дочекатися успішних GitHub Actions: lint, TypeScript, operations smoke,
   production build і desktop/mobile browser smoke.
6. Переглянути склад PR і переконатися, що в ньому немає `.env`, credentials,
   PDF, backup-архівів або тестових персональних даних.
7. Після схвалення злити PR у `main`.
8. Створити annotated tag, наприклад `v1.0.0`, на production commit.
9. Записати повний commit SHA і посилання на успішний CI run у протокол
   перенесення.

Railway production підключається до гілки `main`, а не до `staging` і не до
довільної робочої гілки.

## Етап 2. Створення Railway-проєкту

1. В акаунті замовника створити проєкт `GeoPartners Production`.
2. Створити environment `production` у регіоні `EU West`.
3. Додати Railway PostgreSQL.
4. Додати Railway Bucket.
5. Додати три сервіси з одного GitHub-репозиторію:

| Railway service | Branch | Config path |
| --- | --- | --- |
| `geopartners-web` | `main` | `/railway.json` |
| `geopartners-notifications` | `main` | `/railway.notifications.json` |
| `geopartners-backup` | `main` | `/railway.backup.json` |

6. До завершення variables і перенесення даних вимкнути autodeploy або
   залишити перші deployment changes непідтвердженими.
7. Для всіх трьох GitHub-сервісів увімкнути `Wait for CI`.

`web` запускає міграції через `preDeployCommand`, worker обробляє чергу кожні
5 хвилин, а backup створюється щонеділі о 02:00 UTC і зберігається 90 днів.

## Етап 3. Production variables

`.env.example` використовується тільки як перелік назв. Реальні значення
вносяться в Railway і не зберігаються в GitHub.

### Shared Variable

Створити для environment `production`:

```text
EMAIL_USE_SMTP=false
```

Поділитися нею з `geopartners-web` і `geopartners-notifications`. У кожному
сервісі має з'явитися reference:

```text
EMAIL_USE_SMTP=${{ shared.EMAIL_USE_SMTP }}
```

На Railway Hobby використовується Brevo HTTPS API. SMTP-реквізити можна
залишити заздалегідь налаштованими для можливого переходу на Pro, але вони
ігноруються, поки shared flag дорівнює `false`.

### Web

- `APP_URL` і `BETTER_AUTH_URL`;
- новий production `BETTER_AUTH_SECRET`;
- `ADMIN_EMAIL`;
- `DATABASE_URL=${{ Postgres.DATABASE_URL }}`;
- `EMAIL_FROM`, `EMAIL_HTTP_PROVIDER=brevo`, `BREVO_API_KEY`;
- SMTP-блок як неактивний резерв;
- production `GOOGLE_CLIENT_ID` і `GOOGLE_CLIENT_SECRET`;
- Telegram variables, якщо web використовує пряме сповіщення;
- шість `AWS_*` references із production Bucket.

### Notifications

- `DATABASE_URL=${{ Postgres.DATABASE_URL }}`;
- `APP_URL`, `ADMIN_EMAIL`;
- той самий `EMAIL_FROM`, HTTP provider і Brevo API key;
- shared reference `EMAIL_USE_SMTP`;
- `TELEGRAM_BOT_TOKEN` і `TELEGRAM_ADMIN_CHAT_ID`.

### Backup

- `DATABASE_URL=${{ Postgres.DATABASE_URL }}`;
- шість `AWS_*` references із production Bucket.

Секретні значення після перевірки слід позначити як sealed variables. Перед
seal потрібно окремо підтвердити, що значення внесено правильно: sealed
variable не можна прочитати назад або автоматично скопіювати в інший
environment.

## Етап 4. Дані PostgreSQL і Bucket

Детальна процедура, контрольні звірки та rollback описані в
[`STAGING_TO_PRODUCTION.md`](STAGING_TO_PRODUCTION.md).

Перед фінальним backup треба обрати один режим:

1. **Повний snapshot staging.** Переносить користувачів, налаштування, обидві
   робочі області, ділянки, аудит і notification outbox.
2. **Чистий production.** Міграції створюють порожню схему, після чого
   переносяться лише погоджені початкові дані окремим перевіреним імпортом.

Поточний restore-скрипт відновлює повний snapshot. Якщо потрібен повний перенос
без тестових записів, зайві користувачі, sandbox-дані та повідомлення очищуються
у staging **до** фінального backup або видаляються окремим заздалегідь
протестованим скриптом. Ручне редагування production після restore не
використовується як процедура міграції.

Порядок повного перенесення:

1. Виконати restore drill у тимчасову БД.
2. Зупинити записи у джерело на погоджене вікно.
3. Створити й перевірити фінальний PostgreSQL backup.
4. Відновити його в порожній production PostgreSQL.
5. Скопіювати об'єкти Bucket через S3 API без видалення джерела.
6. Звірити кількість записів, PDF, розміри й доступність object references.
7. Лише після звірки дозволити перший production deployment.

## Етап 5. Перший запуск без домену

1. Згенерувати тимчасовий Railway-домен для `geopartners-web`.
2. Тимчасово встановити його HTTPS origin у `APP_URL` і `BETTER_AUTH_URL`.
3. Запустити `web`; дочекатися успішного migration command і health check
   `/api/health`.
4. Запустити `notifications` і перевірити стан outbox без надсилання
   дубльованих старих повідомлень.
5. Запустити backup вручну, перевірити архів і тільки потім залишити cron
   активним.
6. Виконати production smoke test на Railway-домені.

До успішного smoke test custom domain і публічний DNS не перемикаються.

## Етап 6. Домен, OAuth і канали сповіщень

1. Додати custom domain у Networking налаштування `geopartners-web`.
2. Внести на стороні DNS точні `CNAME` і ownership `TXT`, які покаже Railway.
3. Дочекатися Railway verification і автоматичного TLS certificate.
4. Змінити `APP_URL` і `BETTER_AUTH_URL` на фінальний HTTPS origin.
5. У production Google OAuth client додати:

   ```text
   https://FINAL_DOMAIN/api/auth/callback/google
   ```

6. Перевірити відправника Brevo, SPF, DKIM і DMARC фінального домену.
7. Перевірити email через Brevo HTTP API та Telegram-повідомлення з
   production-посиланням.
8. Повторно розгорнути `web` і `notifications`.

## Етап 7. Production acceptance

Мінімальний go/no-go checklist:

- `/api/health`: application, PostgreSQL, storage і notification outbox `ok`;
- вхід адміністратора за email/паролем;
- реєстрація користувача, email verification, pending state, approve/reject;
- Google OAuth для неадміністративного користувача;
- ролі `user`/`admin` і блокування заборонених API;
- desktop і mobile інтерфейси;
- карта, production/sandbox isolation і адмін-перемикач;
- створення, редагування, видалення та аудит ділянки;
- імпорт GeoJSON/PDF і ZIP;
- відкриття раніше перенесеного PDF із Bucket;
- PDF, DOCX, друк, CSV і GeoJSON export;
- Brevo HTTP API і Telegram;
- ручний backup, перевірка архіву та тестовий restore drill.

Після успішного приймання:

1. Зафіксувати `go`, commit SHA, deployment IDs і час перемикання.
2. Увімкнути autodeploy для `main` із `Wait for CI`.
3. Залишити staging і фінальний backup незмінними на період стабілізації.
4. Передати замовнику доступи, runbooks і перелік відповідальних.

## Наступні production-релізи

1. Розробка і перевірка виконуються у `staging`.
2. Створюється PR `staging -> main`.
3. PR проходить review і GitHub Actions.
4. Після merge Railway чекає успішний CI та автоматично розгортає `main`.
5. Перевіряються deployment status, `/api/health` і критичний smoke.
6. Реліз фіксується tag і записом у журнал.

`railway up` не є штатним production-шляхом. Він залишається аварійним
варіантом, якщо GitHub integration недоступна.

## Rollback

### До зміни DNS

- зупинити новий production deployment;
- виправити конфігурацію або відкотити Railway deployment;
- staging і поточний домен користувачів не змінюються.

### Після запуску

- для помилки коду або variables виконати Railway rollback на попередній
  успішний deployment;
- врахувати, що Railway rollback повертає і Docker image, і custom variables;
- для несумісної міграції БД використовувати перевірений backup/restore plan,
  а не тільки rollback контейнера;
- не відновлювати стару БД поверх актуальної без окремого рішення про втрату
  змін після backup timestamp;
- не запускати staging і production одночасно з правом запису в одну БД.

## Критерій завершення передачі

Перенесення завершено, коли:

- production-проєкт і billing належать замовнику;
- усі три сервіси розгортаються з `Yadro13/GeoPartners:main`;
- `Wait for CI`, health check і backup cron активні;
- PostgreSQL та Bucket розміщені в production-проєкті замовника;
- custom domain, TLS, OAuth, Brevo HTTP API і Telegram перевірені;
- production acceptance checklist підписаний;
- rollback і restore drill підтверджені;
- у команди й замовника зафіксовано рівні доступу та відповідальних.

## Офіційна документація Railway

- [GitHub autodeploy і Wait for CI](https://docs.railway.com/deployments/github-autodeploys)
- [Variables, shared і reference variables](https://docs.railway.com/variables)
- [Reference variables](https://docs.railway.com/variables/reference)
- [Custom domains і TLS](https://docs.railway.com/networking/domains/working-with-domains)
- [Deployment rollback](https://docs.railway.com/deployments/deployment-actions)
