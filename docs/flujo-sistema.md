# Flujo del Sistema de Agendamiento Virtual de Citas de Medicina General

El flujo está alineado con los RF-01 a RF-08, las reglas RN-01 a RN-03 y las excepciones de la ficha SAVCM versión 1.0. Las rutas por rol representan las funciones del alcance.

```mermaid
flowchart TD
    A([Inicio]) --> B[Abre SAVCM desde un dispositivo con internet]
    B --> C{¿Tiene cuenta?}
    C -- No, paciente --> D[Ingresa cédula, datos y contraseña]
    D --> E{¿Cédula activa en el padrón EPS?}
    E -- No --> E1[Rechazar registro y explicar cómo validar afiliación]
    E1 --> Z([Fin o volver al registro])
    E -- Sí --> F[Validar formulario y crear cuenta con contraseña hash]
    F --> G[Iniciar sesión]
    C -- Sí --> G[Iniciar sesión con cédula o correo y contraseña]
    G --> H{¿Credenciales válidas y cuenta activa?}
    H -- No --> H1[Mostrar error de autenticación]
    H1 --> G
    H -- Sí --> I{Determinar rol}
    I -- Paciente --> P[Consultar horarios por fecha y médico]
    P --> Q[Mostrar disponibilidad actualizada]
    Q --> R{¿Selecciona un horario libre?}
    R -- No --> P
    R -- Sí --> S[Tomar bloqueo transaccional del horario]
    S --> T{¿Sigue disponible y sin cita simultánea del paciente?}
    T -- No --> T1[Informar conflicto y refrescar horarios alternativos]
    T1 --> P
    T -- Sí --> U[Guardar cita y marcar cupo ocupado]
    U --> V[Mostrar código, fecha, hora y médico]
    V --> W{¿Gestionar una cita existente?}
    W -- No --> Z
    W -- Cancelar --> X[Validar propietario o permiso de recepción]
    X --> X1[Marcar cancelada y liberar el cupo]
    X1 --> X2[Mostrar comprobante de cancelación]
    X2 --> Z
    W -- Reprogramar --> Y[Validar propietario y nuevo horario]
    Y --> Y1{¿Horario disponible y sin cruce?}
    Y1 -- No --> T1
    Y1 -- Sí --> Y2[En una transacción cerrar cita anterior y crear nueva]
    Y2 --> V
    I -- Recepción --> R1[Consultar horarios e indicar cédula del paciente registrado]
    R1 --> P
    I -- Médico --> M[Consultar agenda diaria o semanal]
    M --> M1[Marcar cita realizada o inasistencia]
    M1 --> Z
    I -- Administrador --> AD[Registrar médicos y configurar franjas de agenda]
    AD --> AD1{¿Rango válido y sin cruces?}
    AD1 -- No --> AD2[Informar solapamiento o duración inválida]
    AD2 --> AD
    AD1 -- Sí --> AD3[Generar bloques de atención]
    AD3 --> AD4[Consultar reportes por rango de fechas]
    AD4 --> Z
    B -. Error de red o base de datos .-> ERR[Notificar indisponibilidad sin confirmar cambios no guardados]
    ERR --> Z
    D -. Campos faltantes o inválidos .-> VAL[Resaltar validaciones y solicitar corrección]
    VAL --> D
```

## Correspondencia con la ficha

| Elemento | Implementación |
| --- | --- |
| RF-01, RF-02, RN-03 | Registro solo con cédula activa en el padrón, autenticación y autorización por rol. |
| RF-03 | Consulta de horarios libres por fecha y médico. |
| RF-04, RN-01, RN-02 | Reserva transaccional con bloqueo e índices únicos parciales de PostgreSQL. |
| RF-05, RF-06 | Reprogramación, cancelación y liberación del cupo anterior. |
| RF-07 | Creación de médicos y franjas por administrador. |
| RF-08 | Reportes de ocupación, cancelaciones, reprogramaciones e inasistencia. |
| Situaciones no ideales | Validaciones del formulario, conflicto de horario y errores de servicio. |
