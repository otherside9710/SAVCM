# Flujo del Sistema de Agendamiento Virtual de Citas de Medicina General

El diagrama resume los flujos implementados en SAVCM: registro y acceso, recuperación de contraseña, reserva y gestión de citas, operación médica y administración. Los permisos distinguen los roles de paciente, médico y administrador; no existe un rol de recepción.

```mermaid
flowchart TD
    START([Inicio]) --> PORTAL[Abre SAVCM desde un dispositivo con internet]
    PORTAL --> ACCOUNT{¿Ya tiene cuenta?}

    ACCOUNT -- No --> REGISTER[Completa datos personales, cédula, correo, teléfono, nacimiento y contraseña]
    REGISTER --> REG_VALID{¿Formulario válido?}
    REG_VALID -- No --> REG_ERROR[Mostrar campos por corregir]
    REG_ERROR --> REGISTER
    REG_VALID -- Sí --> EPS_ACTIVE{¿La cédula está activa en el padrón EPS?}
    EPS_ACTIVE -- No --> EPS_ERROR[Rechazar registro e indicar que contacte a la IPS]
    EPS_ERROR --> END([Fin o volver al registro])
    EPS_ACTIVE -- Sí --> DUPLICATE{¿Cédula o correo ya registrados?}
    DUPLICATE -- Sí --> DUPLICATE_ERROR[Informar duplicidad y solicitar corrección]
    DUPLICATE_ERROR --> REGISTER
    DUPLICATE -- No --> REGISTERED[Crear cuenta de paciente con contraseña protegida e iniciar sesión]

    ACCOUNT -- Sí --> LOGIN[Ingresa con cédula o correo y contraseña]
    LOGIN --> FORGOT{¿Solicita recuperar la contraseña?}
    FORGOT -- No --> AUTH{¿Credenciales correctas y cuenta activa?}
    AUTH -- No --> AUTH_ERROR[Mostrar error de autenticación]
    AUTH_ERROR --> LOGIN
    AUTH -- Sí --> ROLE{Determinar rol}
    FORGOT -- Sí --> RESET_REQUEST[Solicita enlace con su correo]
    RESET_REQUEST --> RESET_SEND[Responder sin revelar si existe la cuenta y enviar enlace de un solo uso]
    RESET_SEND --> RESET_VALID{¿Enlace válido, sin usar y vigente por 30 minutos?}
    RESET_VALID -- No --> RESET_ERROR[Informar vencimiento o uso y permitir solicitar otro]
    RESET_ERROR --> RESET_REQUEST
    RESET_VALID -- Sí --> RESET_SAVE[Guardar nueva contraseña e invalidar sesiones anteriores]
    RESET_SAVE --> LOGIN
    REGISTERED --> ROLE

    ROLE -- Paciente --> PATIENT_START[Consultar horarios futuros por fecha y médico]
    PATIENT_START --> SLOT_CHOICE{¿Elige un horario disponible?}
    SLOT_CHOICE -- No --> PATIENT_START
    SLOT_CHOICE -- Sí --> RESERVE[Reservar con bloqueo transaccional del horario]
    ADMIN_PATIENT --> PATIENT_START
    RESERVE --> SLOT_VALID{¿Horario activo, futuro y libre, sin otra cita del paciente en ese bloque?}
    SLOT_VALID -- No --> SLOT_CONFLICT[Informar conflicto y actualizar disponibilidad]
    SLOT_CONFLICT --> PATIENT_START
    SLOT_VALID -- Sí --> BOOKED[Guardar cita agendada y ocupar el horario]
    BOOKED --> BOOK_CONFIRM[Mostrar comprobante con código, fecha, hora y médico]
    BOOK_CONFIRM --> BOOKER{¿Quién realizó la reserva?}
    BOOKER -- Paciente --> PATIENT_APPTS[Consultar citas propias, historial y cancelaciones]
    BOOKER -- Administrador --> ADMIN_APPTS
    PATIENT_APPTS --> PATIENT_ACTION{¿Qué desea hacer?}
    PATIENT_ACTION -- Consultar o terminar --> END
    PATIENT_ACTION -- Cancelar cita propia --> CANCEL_REASON
    PATIENT_ACTION -- Reprogramar cita propia --> RESCHEDULE_SLOT

    ROLE -- Médico --> DOCTOR_AGENDA[Consultar citas asignadas por día, semana o próximos 30 días]
    DOCTOR_AGENDA --> DOCTOR_ACTION{¿Qué necesita hacer?}
    DOCTOR_ACTION -- Revisar agenda --> END
    DOCTOR_ACTION -- Cancelar y avisar --> CANCEL_REASON
    DOCTOR_ACTION -- Registrar resultado --> STATUS_CHECK

    ROLE -- Administrador --> ADMIN_HOME[Entrar al centro de control]
    ADMIN_HOME --> ADMIN_AREA{¿Qué necesita gestionar?}
    ADMIN_AREA -- Médicos --> ADMIN_DOCTORS[Crear cuentas de médicos y activar o suspender su acceso]
    ADMIN_DOCTORS --> ADMIN_HOME
    ADMIN_AREA -- Crear agenda --> SCHEDULE_FORM[Elegir médico activo, fecha, rango horario, duración y consultorio]
    SCHEDULE_FORM --> SCHEDULE_VALID{¿Fecha futura, rango válido, duración exacta y sin cruces?}
    SCHEDULE_VALID -- No --> SCHEDULE_ERROR[Informar fecha, duración o solapamiento inválido]
    SCHEDULE_ERROR --> SCHEDULE_FORM
    SCHEDULE_VALID -- Sí --> SCHEDULE_CREATE[Generar bloques de atención]
    SCHEDULE_CREATE --> ADMIN_HOME
    ADMIN_AREA -- Consultar agenda --> ADMIN_AGENDA[Filtrar agenda por rango y médico; ver ocupados, libres y cerrados]
    ADMIN_AGENDA --> SLOT_ADMIN_ACTION{¿Cambiar estado de un horario?}
    SLOT_ADMIN_ACTION -- No --> ADMIN_HOME
    SLOT_ADMIN_ACTION -- Sí --> SLOT_ADMIN_VALID{¿Está libre para cerrar y el médico activo para reabrir?}
    SLOT_ADMIN_VALID -- No --> SLOT_ADMIN_ERROR[Impedir el cambio si tiene cita o el médico está inactivo]
    SLOT_ADMIN_ERROR --> ADMIN_AGENDA
    SLOT_ADMIN_VALID -- Sí --> SLOT_ADMIN_SAVE[Cerrar o reabrir el horario]
    SLOT_ADMIN_SAVE --> ADMIN_AGENDA
    ADMIN_AREA -- Pacientes y padrón EPS --> ADMIN_PATIENTS[Buscar pacientes y administrar cuentas y cédulas del padrón]
    ADMIN_PATIENTS --> ROSTER_ACTION{¿Qué cambia?}
    ROSTER_ACTION -- Cuenta --> USER_ACTIVE[Activar o suspender cuenta de paciente]
    USER_ACTIVE --> ADMIN_HOME
    ROSTER_ACTION -- Padrón --> ROSTER_ACTIVE[Agregar, activar o desactivar cédula EPS]
    ROSTER_ACTIVE --> EPS_ACCOUNT{¿Se desactivó la cédula?}
    EPS_ACCOUNT -- Sí --> SUSPEND_PATIENT[Suspender también la cuenta del paciente]
    EPS_ACCOUNT -- No --> ADMIN_HOME
    SUSPEND_PATIENT --> ADMIN_HOME
    ADMIN_AREA -- Citas --> ADMIN_APPTS[Consultar todas las citas y filtrar por fecha, médico, estado o paciente]
    ADMIN_APPTS --> ADMIN_APPT_ACTION{¿Qué operación realiza?}
    ADMIN_APPT_ACTION -- Consultar --> ADMIN_HOME
    ADMIN_APPT_ACTION -- Agendar por API --> ADMIN_PATIENT[Indicar cédula de un paciente registrado y activo]
    ADMIN_PATIENT --> PATIENT_START
    ADMIN_APPT_ACTION -- Cancelar --> CANCEL_REASON
    ADMIN_APPT_ACTION -- Reprogramar --> RESCHEDULE_SLOT
    ADMIN_APPT_ACTION -- Registrar resultado por API --> STATUS_CHECK
    ADMIN_AREA -- Reportes --> REPORTS[Consultar ocupación, ausentismo, cancelaciones y reprogramaciones por fechas]
    REPORTS --> ADMIN_HOME

    CANCEL_REASON[Ingresar motivo de cancelación de 3 a 500 caracteres] --> CANCEL_CHECK{¿Actor autorizado y estado cancelable?}
    CANCEL_CHECK -- No --> CANCEL_ERROR[Rechazar la operación e informar el motivo]
    CANCEL_ERROR --> END
    CANCEL_CHECK -- Sí --> CANCEL_SAVE[Registrar origen y motivo, cancelar cita y liberar el horario]
    CANCEL_SAVE --> CANCEL_BY_DOCTOR{¿Canceló el médico asignado?}
    CANCEL_BY_DOCTOR -- Sí --> CANCEL_EMAIL[Intentar enviar el motivo al paciente por correo]
    CANCEL_EMAIL --> EMAIL_SENT{¿Se envió el correo?}
    EMAIL_SENT -- Sí --> CANCEL_HISTORY[Mostrar comprobante y conservar motivo y origen en el historial]
    EMAIL_SENT -- No --> CANCEL_HISTORY
    CANCEL_BY_DOCTOR -- No --> CANCEL_HISTORY
    CANCEL_HISTORY --> END

    RESCHEDULE_SLOT[Elegir nueva fecha, médico y horario disponible] --> RESCHEDULE_CHECK{¿Actor autorizado y nuevo horario libre?}
    RESCHEDULE_CHECK -- No --> RESCHEDULE_ERROR[Informar conflicto y actualizar horarios]
    RESCHEDULE_ERROR --> RESCHEDULE_SLOT
    RESCHEDULE_CHECK -- Sí --> RESCHEDULE_SAVE[En una transacción marcar la anterior reprogramada y crear la nueva cita]
    RESCHEDULE_SAVE --> BOOK_CONFIRM

    STATUS_CHECK{¿Es el médico asignado o administrador y ya terminó la cita agendada?}
    STATUS_CHECK -- No --> STATUS_ERROR[Informar que no tiene permiso o que aún no termina]
    STATUS_ERROR --> END
    STATUS_CHECK -- Sí --> STATUS_SET[Registrar resultado: realizada o inasistencia]
    STATUS_SET --> END

    PORTAL -. Error de red o base de datos .-> SERVICE_ERROR[Notificar indisponibilidad y no confirmar cambios no guardados]
    SERVICE_ERROR --> END
```

## Correspondencia con las funciones implementadas

| Área | Comportamiento reflejado |
| --- | --- |
| Registro y acceso | Registro de pacientes solo con cédula activa en el padrón EPS; acceso con cédula o correo; autorización por rol. |
| Recuperación de contraseña | Enlace de un solo uso, vence a los 30 minutos y tiene espera de 60 segundos entre solicitudes; al cambiar la contraseña se invalidan las sesiones anteriores. |
| Reserva | Consulta de disponibilidad futura y reserva transaccional; se comprueban el estado del horario y del médico, la ocupación y las citas simultáneas del paciente. |
| Cancelación | Paciente cancela sus citas agendadas; médico cancela citas agendadas o reprogramadas de su agenda; administrador cancela citas agendadas. Se guarda motivo y origen (`DOCTOR`, `PATIENT` o `STAFF`). La cancelación del médico avisa por correo y el motivo queda en el historial aunque falle el envío. |
| Reprogramación y resultado | Paciente o administrador reprograma una cita agendada en una transacción. Médico asignado o administrador registra realizada/inasistencia después de terminar el horario. |
| Operación médica | Consulta de citas asignadas por día, semana o próximos 30 días. |
| Administración | Alta y activación de médicos, creación de bloques sin solapamientos, consulta y apertura/cierre de horarios, administración de cuentas y padrón EPS, consulta de citas, agendamiento por API para pacientes activos y reportes. |
| Situaciones no ideales | Validaciones de formulario, conflictos de disponibilidad o permisos, enlaces de recuperación inválidos y errores de servicio. |
