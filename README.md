# BIC public showcase

Static, bilingual examples accompanying an academic badminton-coaching paper.
The site compares coaching outputs from BIC, ChainBMD, and two direct
multimodal-LLM conditions over a small, explicitly selected stroke set.

The deployed application has no authentication, database, analytics, or
Supabase connection. Its sanitized bundle and content-addressed media are read
directly from `public/data/`.

## Local preview

```bash
nvm use 22
npm install
npm run dev
```

## Production build

```bash
nvm use 22
npm run build
```

See [PUBLIC_SHOWCASE.md](PUBLIC_SHOWCASE.md) for rebuilding the anonymized
three-stroke bundle. Private source bundles and original named assets belong in
the ignored `private_data/` directory and must never be committed or deployed.
