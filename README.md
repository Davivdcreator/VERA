# VERA

React + Vite + TypeScript + Tailwind v4.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

Optional Supabase backend: copy `.env.example` to `.env` and fill in
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (client in `src/lib/supabase.ts`).
