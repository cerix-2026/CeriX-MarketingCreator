# CeriX Marketing Engine

AI-drevet marketing platform til Cerix.

## Deploy på Railway

1. Upload denne mappe til et GitHub repo
2. Opret nyt projekt på railway.app → "Deploy from GitHub repo"
3. Tilføj environment variables:
   - `ANTHROPIC_API_KEY` = din Anthropic API-nøgle
   - `JWT_SECRET` = en lang tilfældig streng (fx `cerix-super-secret-2024-xyz`)
4. Railway deployer automatisk

## Login
- Email: `admin@cerix.dk`
- Adgangskode: `cerix2024`

**Skift adgangskode efter første login under Brugere.**

## Mappestruktur
- `server/` — Express API + agent-pipeline
- `client/` — React frontend (single HTML file)
- `server/data/` — oprettes automatisk ved start
- `server/uploads/` — oprettes automatisk ved start
