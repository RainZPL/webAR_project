# North Star AR (WebAR Prototype)

Mobile-first WebAR exploration prototype built with Vite + Three.js.

## Local Setup

1. Install dependencies:
   `npm install`
2. Run the dev server:
   `npm run dev`
3. Open:
   `http://localhost:3000`

## Mobile Testing Notes

- Camera and motion sensors require HTTPS (or `http://localhost`).
- For real device testing, deploy to Vercel/Netlify or use a local HTTPS tunnel.
- iOS Safari requires a user gesture to grant DeviceOrientation access.

## Permissions

- Camera: used for the fallback AR camera background.
- Location (GPS): used for node spawning and distance tracking.
- Motion/Orientation: used for heading/reticle alignment.
- Manual overrides: use the `OUTSIDE` / `I'M HOME` buttons if sensors are blocked.

## Build & Deploy

1. Build:
   `npm run build`
2. Preview:
   `npm run preview`
3. Deploy the `dist/` folder to Vercel or Netlify.
