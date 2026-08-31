# iHello Admin (TanStack Start + shadcn/ui)

SPA admin console for the site-chat Worker APIs.

Stack: TanStack Start, Tailwind CSS v4, shadcn/ui (Radix), Sonner.

```bash
# with agent worker on :8787
npm run dev
```

App: `http://127.0.0.1:3000/admin/`

Add components:

```bash
npx shadcn@latest add <component>
```

Production embed:

```bash
npm run build
# copies dist/client → ../public/admin
```
