# سرور ابری درس‌نگار روی Cloudflare Workers + D1

این پوشه شامل بک‌اند کامل Cloudflare Worker و دیتابیس Cloudflare D1 (مشابه معماری پروژه DevQuiz) است تا کاربران بتوانند ثبت‌نام/ورود کنند و درس‌ها، فصل‌ها، جزوه‌ها و پیشرفت خود را روی کلادفلر ذخیره و در هر دستگاهی دریافت کنند.

## استقرار فعلی (انجام‌شده)

- فرانت: https://darsnegar-app.pages.dev (Cloudflare Pages، پروژه `darsnegar-app`)
- بک‌اند: https://darsnegar-api.mohammadjavadsharifi98.workers.dev (Worker `darsnegar-api`)
- دیتابیس: D1 `darsnegar-db` با schema اجراشده، `JWT_SECRET` به‌صورت secret تنظیم شده
- فرانت با `/api/*` روی همان دامنه به Worker پروکسی می‌کند (`functions/api/[[path]].ts`)، چون `*.workers.dev` در بعضی شبکه‌ها مسدود است. پس نیازی به تنظیم آدرس ورکر در تنظیمات نیست.

به‌روزرسانی بعدی:

```bash
# بک‌اند
cd cloudflare-worker && npx wrangler deploy

# فرانت
npm run build && npx wrangler pages deploy dist --project-name darsnegar-app --branch main
```

## مراحل استقرار از صفر (کمتر از ۳ دقیقه)

1. نصب ابزارها در پوشه `cloudflare-worker`:
```bash
cd cloudflare-worker
npm install
npx wrangler login
```

2. ساخت دیتابیس D1 و قرار دادن `database_id` در `wrangler.toml`:
```bash
npx wrangler d1 create darsnegar-db
```

3. اجرای اسکیما روی دیتابیس کلادفلر:
```bash
npm run db:migrate
```

4. تنظیم کلید امن JWT و انتشار ورکر:
```bash
npx wrangler secret put JWT_SECRET
npm run deploy
```

5. آدرس خروجی (مثلاً `https://darsnegar-api.<your-subdomain>.workers.dev`) را در بخش **تنظیمات ← اتصال به کلادفلر** داخل برنامه وارد کنید (یا در متغیر محیطی `VITE_CLOUDFLARE_API_URL` قرار دهید).
