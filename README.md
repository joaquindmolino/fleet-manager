# Fleet Manager — Guía de inicio

## Requisitos previos

- **Docker Desktop** instalado y corriendo (ícono en la barra de tareas)
- **Node.js** instalado (para el frontend)
- Terminal: PowerShell, CMD o la terminal integrada de VS Code

---

## Primer inicio (o después de cambios en el backend)

Abrí una terminal en la carpeta `fleet-manager` y ejecutá estos comandos en orden:

### 1. Construir e iniciar los servicios

```
docker compose build backend celery_worker
docker compose up -d
```

> El primer build puede tardar 2–3 minutos. Los siguientes son más rápidos.

### 2. Verificar que el backend está listo

Esperá unos segundos y revisá que el backend responda:

```
curl http://localhost:8000/health
```

Debe devolver algo como `{"status":"ok"}`. Si no responde, esperá 10 segundos más y reintentá.

### 3. Aplicar migraciones

```
docker compose exec backend alembic upgrade head
```

### 4. Cargar datos iniciales (solo la primera vez)

```
docker compose exec backend python seed.py
```

### 5. Iniciar el frontend

En otra terminal (también dentro de `fleet-manager`):

```
cd frontend
npm install
npm run dev
```

### 6. Abrir el sistema

Abrí el navegador en:

```
http://localhost:5173
```

---

## Credenciales de acceso

| Campo      | Valor                    |
|------------|--------------------------|
| Usuario    | admin@fleetmanager.app   |
| Contraseña | Admin1234!               |

---

## Inicios siguientes (sin cambios en el backend)

Si ya construiste la imagen y solo querés retomar donde dejaste:

```
docker compose up -d
```

Luego en otra terminal:

```
cd frontend
npm run dev
```

Abrí `http://localhost:5173`.

---

## Detener todo

```
docker compose down
```

---

## Revisar logs si algo no funciona

```
docker compose logs backend --tail=50
docker compose logs postgres --tail=20
```

---

## Puertos utilizados

| Servicio   | Puerto local |
|------------|--------------|
| Frontend   | 5173         |
| Backend    | 8000         |
| PostgreSQL | 5433         |
| Redis      | (interno)    |
