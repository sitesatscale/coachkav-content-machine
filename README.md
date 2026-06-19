# Coach Kav — Content Machine

Landing page for the **Content Machine Pack**, a free Claude skill that generates
nine brand-anchored content assets in a single Claude session.

## Structure

- `index.html` — the entire site (HTML + inline CSS + vanilla JS, no build step)
- `assets/` — brand SVGs, emoji, and content mockups
- `fonts/` — self-hosted Futura Condensed faces
- `vercel.json` — static hosting config (no build, long-lived caching for assets/fonts)

## Local preview

It's a single static file — open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy (Vercel)

Static site, **no build**. In Vercel:

- **Framework Preset:** Other
- **Root Directory:** `./`
- **Build Command / Output Directory:** leave empty

`index.html` is served at the root URL automatically.
