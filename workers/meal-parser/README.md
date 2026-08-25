# meal-parser Worker

Проксі між SciSense і Claude API. Перевіряє Firebase ID token, тримає ключ.

- Локально: `npm install`, потім `npm run dev` (http://localhost:8787)
- Секрет (один раз): `npx wrangler secret put ANTHROPIC_API_KEY`
- Деплой: `npm run deploy`
- Дозволені origin: wrangler.toml, змінна ALLOWED_ORIGINS
