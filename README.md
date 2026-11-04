# SAVCM · Sistema de Agendamiento Virtual de Citas de Medicina General

Aplicación web para pacientes de una IPS. Permite reservar, consultar, reprogramar y cancelar citas de medicina general; el personal administra agendas y consulta indicadores.

## Tecnologías

- Frontend: React, TypeScript y Vite.
- Backend: Node.js, NestJS, TypeScript, DDD y arquitectura hexagonal.
- Persistencia: PostgreSQL con TypeORM.
- Autenticación: JWT por rol y contraseñas protegidas con bcrypt.

La estructura del backend toma como referencia [node-backend-skeleton](https://github.com/otherside9710/node-backend-skeleton): contextos separados, casos de uso, adaptadores de persistencia, PostgreSQL y controladores HTTP.

## Estructura del monorepo

```text
backend/       API NestJS, dominio, infraestructura y datos de demostración
frontend/      Aplicación React y Vite
docs/          Ficha, diagrama de flujo y material de presentación
docker-compose.yml
```

Los comandos compartidos y workspaces npm se administran desde la raíz.

## Inicio local

Requisitos: Node.js 20 o superior, npm 10 o superior y Docker con Docker Compose.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm install
npm run db:up
npm run dev:backend
```

En otra terminal, desde la raíz del proyecto:

```bash
npm run dev:frontend
```

Abre `http://localhost:5173`. La API responde en `http://localhost:3001/api`; `GET /api/health` informa el estado del servicio. PostgreSQL queda disponible en `localhost:55432`.

TypeORM crea el esquema automáticamente en desarrollo (`DB_SYNCHRONIZE=true`). Para producción, usar `DB_SYNCHRONIZE=false` y migraciones versionadas; la aplicación no arranca en producción con sincronización automática activa. Las comunicaciones de producción deben pasar por un proxy con TLS, que debe reenviar `X-Forwarded-Proto: https`.

## Cuentas para la demostración local

Las cuentas de personal se crean solo cuando `DEMO_SEED=true`:

| Rol | Usuario | Contraseña local inicial |
| --- | --- | --- |
| Administrador | admin@savcm.local | Admin123! |
| Médico general | doctor@savcm.local | Doctor123! |

El entorno de demostración también crea cuatro médicos adicionales (`medico01@savcm.local`, `medico02@savcm.local`, `medico03@savcm.local` y `medico06@savcm.local`), con contraseña `DEMO_DOCTOR_PASSWORD` o `Doctor123!` si no se configura. Cada uno tiene agenda de lunes a viernes para los próximos 30 días.

Para probar el registro, usa una cédula ficticia incluida en `backend/data/eps-patient-roster.json`: `1000000001`, `1000000002` o `1000000003`. Completa nombre, apellido, correo y contraseña. Las demás cédulas se rechazan.

Estas credenciales y cédulas son exclusivamente para desarrollo. Sustituye las claves desde `backend/.env` y desactiva `DEMO_SEED` antes de desplegar.

## Padrón EPS

El servicio inicializa `eps_patient_roster` desde `backend/data/eps-patient-roster.json`. Este archivo contiene cédulas ficticias para hacer demostrable la validación sin usar datos personales reales. Antes de producción, reemplázalo por la fuente autorizada de la EPS y define un proceso seguro de importación/revocación. La cédula activa es condición obligatoria para que un paciente cree su cuenta.

La verificación contra el padrón confirma pertenencia al listado cargado. No reemplaza mecanismos de verificación de identidad que la EPS decida exigir.

## Recuperación de contraseña

El login permite solicitar un enlace al correo registrado. Los enlaces vencen en 30 minutos, solo se pueden usar una vez y las solicitudes tienen una espera de 60 segundos. El servidor guarda únicamente el hash del token y cambia la versión de contraseña para invalidar sesiones abiertas cuando se completa la recuperación.

Para enviar correos reales desde una cuenta personal de Google, activa la verificación en dos pasos y crea una contraseña de aplicación para este proyecto. Configura en `backend/.env`:

```env
APP_BASE_URL=http://localhost:5173
GMAIL_USER=tu-cuenta@gmail.com
GMAIL_APP_PASSWORD=contraseña_de_aplicación_de_16_caracteres
```

No uses la contraseña normal de tu cuenta ni la pegues en el chat. Gmail envía desde la dirección autenticada. En desarrollo, si faltan estas variables, el enlace de recuperación se imprime en la consola del backend para probar el flujo. En producción, la API rechaza la solicitud si falta la configuración. Gmail personal tiene límites de envío y está pensado para volúmenes pequeños; para esta demostración sirve, pero un proveedor transaccional dedicado es más adecuado para producción.

Rutas públicas: `POST /api/auth/forgot-password` recibe `{ "email": "..." }` y `POST /api/auth/reset-password` recibe `{ "token": "...", "password": "..." }`.

## Funcionalidades implementadas

- Registro de pacientes y autenticación de paciente, médico y administrador.
- Consulta de disponibilidad por fecha y médico.
- Agendamiento, historial, cancelación y reprogramación de citas.
- Restricción de duplicidad por paciente y médico con transacciones e índices únicos de PostgreSQL.
- Alta de médicos, configuración de bloques de agenda y consulta de agenda médica.
- Registro del resultado de atención: realizada o inasistencia.
- Indicadores por rango de fechas: ocupación, cancelación, reprogramación e inasistencia.
- Validaciones de formulario, autorización por rol y mensajes para conflictos de disponibilidad.

## Rutas principales

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/api/auth/register` | Público; cédula activa en padrón |
| POST | `/api/auth/login` | Público |
| GET | `/api/auth/me` | Usuario autenticado |
| GET | `/api/doctors` | Usuario autenticado |
| POST | `/api/doctors` | Administrador |
| PATCH | `/api/doctors/:id/active` | Administrador |
| GET | `/api/schedules/available?date=AAAA-MM-DD&doctorId=UUID` | Usuario autenticado |
| POST | `/api/schedules` | Administrador |
| PATCH | `/api/schedules/:id/active` | Administrador |
| GET | `/api/schedules/my?from=AAAA-MM-DD&to=AAAA-MM-DD` | Médico |
| POST | `/api/appointments` | Paciente o administrador |
| GET | `/api/appointments` | Lista propia para paciente/médico; todas para admin |
| PATCH | `/api/appointments/:id/cancel` | Propietario, médico de la agenda o administrador |
| PATCH | `/api/appointments/:id/reschedule` | Propietario o administrador |
| PATCH | `/api/appointments/:id/status` | Médico de la agenda o administrador |
| GET | `/api/reports?from=AAAA-MM-DD&to=AAAA-MM-DD` | Administrador |
| GET | `/api/admin/users` | Administrador |
| PATCH | `/api/admin/users/:id/active` | Administrador |
| GET / POST | `/api/admin/eps-roster` | Administrador |
| PATCH | `/api/admin/eps-roster/:documentId/active` | Administrador |

Los bloques de atención se configuran por fecha y duración; esta versión no modela reglas recurrentes por día de semana.

## Diagrama y material de avance

- [Flujo del sistema](docs/flujo-sistema.md)
- [Resumen para presentar](docs/avance-presentacion.md)

El alcance conserva las exclusiones de la ficha: no incluye historia clínica, pagos/facturación, telemedicina ni fórmulas médicas.
