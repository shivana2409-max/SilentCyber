# SilentCyber

App Node preparada para Render.

## Deploy en Render

1. Sube este proyecto a GitHub.
2. En Render, crea un nuevo `Web Service`.
3. Conecta el repositorio.
4. Usa:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Configura `Health Check Path` como `/healthz`.
6. Publica el servicio.

## Nota importante

- En local sobre Windows, el backend puede leer mas datos reales del equipo.
- En Render, la app corre sobre Linux en la nube, asi que no puede leer el hardware real del visitante como si fuera su PC.
- La base actual usa SQLite local.
- Segun la documentacion oficial de Render, el sistema de archivos es efimero por defecto y los servicios Free no pueden adjuntar persistent disk.
- Si la publicas en Free, los datos pueden perderse en reinicios o deploys.
- Para persistencia real en Render necesitas una base externa como Postgres/Supabase o un plan pagado con persistent disk.
