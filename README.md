# GeoPartners

Вебзастосунок для ведення земельних ділянок: карта, картки ділянок, імпорт GeoJSON/PDF окремими файлами або з ZIP, журнал змін, звіти, керування користувачами та окремі робоча/тестова області даних.

## Стек

- Next.js 16, React 19, TypeScript;
- PostgreSQL, Drizzle ORM;
- Better Auth: email/пароль та Google OAuth;
- Leaflet, Turf.js;
- Railway: web, PostgreSQL, worker сповіщень, cron резервних копій та Object Storage.

## Локальний запуск

Потрібні Node.js 24, PostgreSQL та змінні з `.env.example`.

```bash
npm ci
npm run db:migrate
npm run dev
```

Застосунок відкривається на `http://localhost:3000`. Інтерфейс із демо-даними без авторизації доступний на `/ui-preview`.

## Перевірки

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Для browser smoke test застосунок має бути запущений. Іншу адресу можна передати через `BASE_URL`.

## Експлуатація

- [Розгортання на Railway](RAILWAY_DEPLOY.md)
- [Резервні копії та відновлення](docs/BACKUP_RESTORE.md)
- [Dry-run перенесення staging у production](docs/STAGING_TO_PRODUCTION.md)
- [Інструкція користувача](docs/USER_GUIDE.md)
- [Інструкція адміністратора](docs/ADMIN_GUIDE.md)
- [Приймальний чек-лист](docs/ACCEPTANCE_CHECKLIST.md)
- [Backlog тестового середовища](docs/STAGING_BACKLOG.md)
- [Питання до замовника](docs/CUSTOMER_QUESTIONS.md)

Секрети зберігаються лише у змінних Railway або локальному `.env.local`. Архіви БД, завантажені документи та реальні облікові дані не додаються до Git.
