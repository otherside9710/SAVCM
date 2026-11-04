# Avance para presentar

## Qué está construido

- Aplicación web en React para iniciar sesión, registrarse, consultar disponibilidad y gestionar citas.
- API en NestJS organizada por contextos, con PostgreSQL como persistencia.
- Padrón inicial de cédulas: el registro público se rechaza si la cédula no está activa.
- Administración del padrón EPS y activación o suspensión de cuentas desde el rol administrador.
- Roles de paciente, médico, recepción y administración.
- Agendamiento con protección ante solicitudes simultáneas y citas duplicadas.
- Reprogramación, cancelación, agenda médica, creación de franjas y reporte de indicadores.
- Diagrama Mermaid alineado con los requerimientos y excepciones de la ficha.

## Dificultades y decisiones

- La ficha no incluye cédulas reales de la EPS. Hay tres identificaciones ficticias de demostración; deben reemplazarse por el padrón autorizado antes de usar datos reales.
- La concurrencia se protege mediante bloqueo transaccional del horario e índices únicos en PostgreSQL para citas activas.
- La ficha propone Express; el equipo solicitó NestJS. Nest funciona sobre Express y se organiza con DDD y arquitectura hexagonal usando el esqueleto indicado.
- HTTPS se exige en producción detrás de un proxy TLS; el entorno local usa HTTP.

## Próximos pasos sugeridos

1. Sustituir el padrón ficticio por el listado validado de la EPS y acordar cómo actualizarlo.
2. Confirmar con la IPS la duración de consulta, consultorios, horarios y zona horaria.
3. Configurar dominio, certificado TLS, copias de seguridad y monitoreo para la disponibilidad objetivo.
4. Realizar una demostración por roles y recorrer los casos alternos del diagrama.
