# Desplegar el servidor GoHighLevel en la nube (para todo el equipo)

Con esto el servidor corre una sola vez en internet y cada persona lo conecta
desde Claude como **conector personalizado**, sin instalar nada en su PC.

## Seguridad (leer primero)

- El servidor **exige una clave de acceso** (`MCP_ACCESS_KEY`). Sin ella, en
  producción se niega a arrancar. Solo `/health` queda abierto.
- La clave va dentro de la dirección: `https://TU-SERVIDOR/<CLAVE>/mcp`.
  **Quien tenga esa dirección completa puede leer tu CRM.** Trátala como una
  contraseña: no la pegues en chats públicos, correos masivos ni repositorios.
- Usa un token de GoHighLevel de **solo lectura** (permisos `.readonly`) creado
  solo para esto. Si la dirección se filtra, desactivas ese token y cambias la clave.
- Para rotar: cambia `MCP_ACCESS_KEY` en el hosting y actualiza la dirección del conector.

## Paso 1: subir el código a tu GitHub

El hosting despliega desde un repositorio. Usa tu repositorio
`ypcdelacruz-prog/Go-High-Level-MCP-2026-Complete` (o una copia **privada**) con
estos cambios incluidos: `src/access-key.ts`, `src/main.ts`,
`tests/access-key.test.ts`, `render.yaml`, `.env.example`.

**Nunca subas el archivo `.env`** ni `claude_desktop_config.ghl.json`
(contienen tu token). El `.env` ya está en el `.gitignore`; el
`claude_desktop_config.ghl.json` no, así que no lo agregues al repositorio.

## Paso 2: crear el servicio (ejemplo con Render)

Cualquier hosting que ejecute Docker sirve (Render, Railway, Fly.io, Azure
Container Apps...). El proyecto ya trae `Dockerfile` y `render.yaml`.

1. Crea una cuenta en render.com y conéctala a tu GitHub.
2. New → **Blueprint** → elige el repositorio. Render lee `render.yaml`.
3. Cuando pida las variables secretas, completa:
   - `GHL_API_KEY`: el token **de solo lectura** nuevo de GoHighLevel.
   - `GHL_LOCATION_ID`: `LQoczjkXPESny0JItXix`
   - `MCP_ACCESS_KEY`: una clave aleatoria. Genérala en PowerShell:
     ```powershell
     -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
     ```
     Guárdala en un gestor de contraseñas.
4. Despliega. Cuando termine, abre `https://TU-SERVIDOR.onrender.com/health`:
   debe responder `{"status":"healthy", ...}`.

Nota: los planes gratuitos suelen "dormir" el servicio tras un rato sin uso y
tardan en despertar. Para uso real del equipo conviene un plan que se mantenga encendido.

## Paso 3: conectar a Claude

1. En Claude (claude.ai o la app): Configuración → **Conectores** → **Agregar conector personalizado**.
2. Dirección: `https://TU-SERVIDOR.onrender.com/<MCP_ACCESS_KEY>/mcp`
3. Guarda y habilita el conector en un chat nuevo.
4. Si tu plan es de equipo, puede que solo un administrador pueda agregarlo
   para toda la organización; después cada persona lo activa en su cuenta.

## Comprobaciones rápidas

```bash
curl https://TU-SERVIDOR/health                      # 200, abierto
curl https://TU-SERVIDOR/mcp                         # 401, sin clave
curl https://TU-SERVIDOR/<CLAVE>/tools               # 200, con clave
```

## Probar localmente

```bash
MCP_ACCESS_KEY=una-clave-de-al-menos-24-caracteres npm run start:http
```
