# Google OAuth & Username Setup Checklist

- [x] Configure Google Cloud Console credentials (user setup)
- [x] Install auth dependencies in `backend/` (`passport`, `passport-google-oauth20`, `express-session`, `@types/passport`, `@types/passport-google-oauth20`, `@types/express-session`) -> Not needed; implemented zero-dependency Google GSI token validation
- [x] Update database schema (`schema.prisma`)
  - [x] Add `UserProfile` model
  - [x] Add `userId` relations to `Project`, `TimeEntry`, `Reminder`
  - [x] Run `npx prisma db push --accept-data-loss`
  - [x] Regenerate Prisma Client
- [x] Implement backend auth and check-username routes in `backend/index.ts`
- [x] Implement frontend login/register forms and username availability checking
- [x] Verify builds and run dev servers
