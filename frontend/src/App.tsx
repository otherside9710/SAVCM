import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Brand } from './components/Brand';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
type Role = 'PATIENT' | 'DOCTOR' | 'RECEPTIONIST' | 'ADMIN';
type User = { sub: string; documentType: string; documentId: string; email: string; firstName: string; lastName: string; role: Role; doctorId?: string };
type Session = { accessToken: string; user: User };
type Doctor = { id: string; name: string; email: string; specialty: string; defaultRoom?: string };
type Slot = { slotId: string; doctorId: string; doctorFirstName: string; doctorLastName: string; specialty: string; date: string; startTime: string; endTime: string; room: string | null; available: boolean };
type Appointment = { id: string; slotId: string; date: string; startTime: string; endTime: string; status: string; cancellationReason?: string | null; patientDocument: string; patientFirstName: string; patientLastName: string; doctorId: string; doctorFirstName: string; doctorLastName: string; specialty: string; defaultRoom?: string };
type Report = { totals: { total: number; scheduled: number; cancelled: number; rescheduled: number; completed: number; noShow: number }; absenceRatePercent: number; cancellationAndReschedulePercent: number; agendaOccupancyPercent: number; doctors: Array<{ doctorId: string; doctor: string; offeredSlots: number; reservedSlots: number; occupancyPercent: number }> };
type AppointmentConfirmation = { kind: 'booked' | 'rescheduled' | 'cancelled'; appointment: Appointment };
type ManagedUser = { id: string; documentId: string; email: string; firstName: string; lastName: string; role: Role; active: boolean };
type RosterPatient = { documentId: string; active: boolean };
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
type PatientAppointmentView = 'upcoming' | 'history' | 'cancelled';
type PatientNavItem = 'home' | 'booking' | 'appointments' | 'history' | 'profile';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('savcm-token');
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error('No se pudo conectar con el sistema. Revisa la conexión y vuelve a intentar.');
  }
  const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message;
    throw new Error(message || 'No se pudo completar la solicitud.');
  }
  return payload as T;
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function roleName(role: Role) {
  return ({ PATIENT: 'Paciente', DOCTOR: 'Médico general', RECEPTIONIST: 'Recepción', ADMIN: 'Administración' })[role];
}

function isSupportedRole(role: string): role is Role {
  return ['PATIENT', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'].includes(role);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState('');
  const [recoveryToken, setRecoveryToken] = useState(() => {
    const hash = window.location.hash;
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get('token') || '';
  });

  useEffect(() => {
    if (recoveryToken) { setBooting(false); return; }
    const token = localStorage.getItem('savcm-token');
    if (!token) { setBooting(false); return; }
    api<User>('/auth/me').then((user) => setSession({ accessToken: token, user })).catch((error) => {
      localStorage.removeItem('savcm-token');
      setNotice(error instanceof Error ? error.message : 'Tu sesión no está habilitada. Inicia sesión de nuevo.');
    }).finally(() => setBooting(false));
  }, [recoveryToken]);

  function signIn(next: Session) {
    localStorage.setItem('savcm-token', next.accessToken);
    setSession(next);
    setNotice('');
  }

  function signOut() {
    localStorage.removeItem('savcm-token');
    setSession(null);
  }

  function finishPasswordRecovery() {
    localStorage.removeItem('savcm-token');
    setSession(null);
    window.history.replaceState({}, '', window.location.pathname);
    setRecoveryToken('');
  }

  if (booting) return <div className="loading-screen">Cargando SAVCM…</div>;
  if (!session || recoveryToken) return <AuthScreen onSuccess={signIn} notice={notice} setNotice={setNotice} recoveryToken={recoveryToken} onRecoveryComplete={finishPasswordRecovery} />;
  if (!isSupportedRole(session.user.role)) return <AccessBlockedScreen onSignOut={signOut} />;
  return <Dashboard session={session} onSignOut={signOut} />;
}

function AccessBlockedScreen({ onSignOut }: { onSignOut: () => void }) {
  return <main className="access-blocked">
    <Brand />
    <p className="eyebrow">ACCESO PENDIENTE</p>
    <h1>Tu cuenta no tiene un perfil habilitado.</h1>
    <p>Para ingresar, tu usuario debe tener un rol válido y, si eres paciente, una cédula activa en el padrón de la EPS. Contacta al administrador para revisar el acceso.</p>
    <button className="button primary" onClick={onSignOut}>Volver al inicio de sesión</button>
  </main>;
}

function AuthScreen({ onSuccess, notice, setNotice, recoveryToken, onRecoveryComplete }: { onSuccess: (session: Session) => void; notice: string; setNotice: (value: string) => void; recoveryToken: string; onRecoveryComplete: () => void }) {
  const [mode, setMode] = useState<AuthMode>(recoveryToken ? 'reset' : 'login');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identifier: '', password: '', documentId: '', firstName: '', lastName: '', email: '', phone: '', birthDate: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice('');
    setSuccessMessage('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(''); setSuccessMessage(''); setBusy(true);
    try {
      if (mode === 'forgot') {
        const result = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: recoveryEmail }) });
        setSuccessMessage(result.message);
      } else if (mode === 'reset') {
        if (newPassword !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
        await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: recoveryToken, password: newPassword }) });
        setForm((current) => ({ ...current, password: '' }));
        setNewPassword(''); setConfirmPassword('');
        setMode('login');
        onRecoveryComplete();
        setSuccessMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
      } else {
        const route = mode === 'login' ? '/auth/login' : '/auth/register';
        const body = mode === 'login'
          ? { identifier: form.identifier, password: form.password }
          : { documentType: 'CC', documentId: form.documentId, firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, birthDate: form.birthDate, password: form.password };
        onSuccess(await api<Session>(route, { method: 'POST', body: JSON.stringify(body) }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo completar la solicitud.');
    } finally { setBusy(false); }
  }

  const heading = mode === 'login' ? 'Bienvenido de nuevo'
    : mode === 'register' ? 'Crea tu cuenta'
      : mode === 'forgot' ? 'Recupera tu contraseña' : 'Crea una contraseña nueva';
  const description = mode === 'login' ? 'Ingresa con la cédula o el correo registrado.'
    : mode === 'register' ? 'El registro está disponible para pacientes activos de la EPS.'
      : mode === 'forgot' ? 'Te enviaremos un enlace al correo asociado a tu cuenta.'
        : 'Elige una contraseña de al menos 8 caracteres.';

  return <main className={`auth-layout auth-${mode}`}>
    <section className="auth-intro">
      <Brand />
      <p className="eyebrow">CENTRO MÉDICO · MEDICINA GENERAL</p>
      <h1>Tu salud merece<br />una cita sencilla.</h1>
      <p className="intro-copy">Consulta horarios disponibles, agenda desde donde estés y mantén tus citas bajo control.</p>
      <div className="intro-points"><span><b>01</b> Disponibilidad actualizada</span><span><b>02</b> Confirmación inmediata</span><span><b>03</b> Gestión segura por cédula</span></div>
      <div className="leaf-art" aria-hidden="true"><span /><span /><span /></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <Brand className="mobile-brand" />
        <p className="eyebrow">PORTAL DE CITAS</p>
        <h2>{heading}</h2>
        <p className="muted">{description}</p>
        {(mode === 'login' || mode === 'register') ? <div className="auth-tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Iniciar sesión</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Registrarme</button>
        </div> : <button className="auth-back" type="button" onClick={() => changeMode('login')}>← Volver a iniciar sesión</button>}
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' ? <>
            <label>Tipo de documento<select value="CC" disabled><option value="CC">CC · Cédula de ciudadanía</option></select></label>
            <label>Cédula registrada en la EPS<input required inputMode="numeric" autoComplete="off" value={form.documentId} onChange={(e) => set('documentId', e.target.value)} placeholder="Número de documento" /></label>
            <div className="form-row"><label>Nombres<input required minLength={2} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></label><label>Apellidos<input required minLength={2} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></label></div>
            <label>Fecha de nacimiento<input required max={today()} type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></label>
            <label>Correo electrónico<input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@correo.com" /></label>
            <label>Teléfono<input required type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          </> : mode === 'login' ? <>
            <label>Cédula o correo electrónico<input required autoComplete="username" value={form.identifier} onChange={(e) => set('identifier', e.target.value)} placeholder="Tu cédula o correo" /></label>
            <label>Contraseña<input required type="password" autoComplete="current-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Tu contraseña" /></label>
            <button className="forgot-link" type="button" onClick={() => { setRecoveryEmail(form.identifier.includes('@') ? form.identifier : ''); changeMode('forgot'); }}>¿Olvidaste tu contraseña?</button>
          </> : mode === 'forgot' ? <label>Correo electrónico registrado<input required type="email" autoComplete="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="nombre@correo.com" /></label>
            : <>
              <label>Nueva contraseña<input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
              <label>Confirma la contraseña<input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Escríbela de nuevo" /></label>
            </>}
          {notice && <div className="notice error" role="alert">{notice}</div>}
          {successMessage && <div className="notice success" role="status">{successMessage}</div>}
          <button className="button primary full" type="submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Ingresar al portal' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace de recuperación' : 'Guardar nueva contraseña'}</button>
        </form>
        {(mode === 'login' || mode === 'register') && <>
          <div className="demo-hint"><strong>Entorno de demostración</strong><span>El padrón incluye cédulas ficticias de prueba. Consulta las cuentas de cada rol en el README.</span></div>
          <p className="privacy-note">Tus credenciales se almacenan protegidas y solo pacientes registrados en el padrón pueden crear una cuenta.</p>
        </>}
      </div>
    </section>
  </main>;
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { user } = session;
  const isAppointmentManager = user.role === 'RECEPTIONIST' || user.role === 'ADMIN';
  const canBook = user.role === 'PATIENT' || isAppointmentManager;
  const [date, setDate] = useState(() => canBook ? nextBusinessDay(today()) : today());
  const [doctorRange, setDoctorRange] = useState<'day' | 'week'>('day');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientDocument, setPatientDocument] = useState('');
  const [reschedulingId, setReschedulingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationError, setCancellationError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [reportFrom, setReportFrom] = useState(`${today().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [patientAppointmentView, setPatientAppointmentView] = useState<PatientAppointmentView>('upcoming');
  const [patientNavItem, setPatientNavItem] = useState<PatientNavItem>('home');
  const [profileOpen, setProfileOpen] = useState(false);
  const isPatient = user.role === 'PATIENT';
  const visibleSlots = useMemo(() => slots.filter((slot) => slot.available), [slots]);
  const upcomingAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.status === 'SCHEDULED' && dateKey(appointment.date) >= today())
    .sort((left, right) => `${dateKey(left.date)} ${left.startTime}`.localeCompare(`${dateKey(right.date)} ${right.startTime}`)), [appointments]);
  const nextAppointment = upcomingAppointments[0];
  const historyAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.status !== 'CANCELLED' && (dateKey(appointment.date) < today() || ['COMPLETED', 'NO_SHOW'].includes(appointment.status)))
    .sort((left, right) => `${dateKey(right.date)} ${right.startTime}`.localeCompare(`${dateKey(left.date)} ${left.startTime}`)), [appointments]);
  const cancelledAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.status === 'CANCELLED')
    .sort((left, right) => `${dateKey(right.date)} ${right.startTime}`.localeCompare(`${dateKey(left.date)} ${left.startTime}`)), [appointments]);
  const patientVisibleAppointments = patientAppointmentView === 'upcoming' ? upcomingAppointments : patientAppointmentView === 'history' ? historyAppointments : cancelledAppointments;
  const firstName = user.firstName.trim().split(/\s+/)[0] || 'bienvenido';

  function navigatePatient(item: PatientNavItem) {
    setPatientNavItem(item);
    if (item === 'profile') { setProfileOpen(true); return; }
    if (item === 'history') setPatientAppointmentView('history');
    else if (item === 'appointments') setPatientAppointmentView('upcoming');
    const target = item === 'booking' ? '#scheduling' : item === 'appointments' || item === 'history' ? '#appointments' : '#top';
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadDoctors() {
    try { setDoctors(await api<Doctor[]>('/doctors')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la agenda médica.'); }
  }

  async function loadSlots() {
    if (!canBook) return;
    try {
      const params = new URLSearchParams({ date });
      if (doctorId) params.set('doctorId', doctorId);
      setSlots(await api<Slot[]>(`/schedules/available?${params.toString()}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar la disponibilidad.'); }
  }

  async function loadAppointments() {
    const params = new URLSearchParams();
    if (user.role === 'DOCTOR') {
      params.set('from', date);
      params.set('to', doctorRange === 'week' ? addDays(date, 6) : date);
    }
    try { setAppointments(await api<Appointment[]>(`/appointments${params.size ? `?${params.toString()}` : ''}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus citas.'); }
  }

  useEffect(() => { void loadDoctors(); void loadAppointments(); }, []);
  useEffect(() => { if (user.role === 'DOCTOR') void loadAppointments(); }, [date, doctorRange]);
  useEffect(() => { void loadSlots(); }, [date, doctorId]);
  useEffect(() => {
    if (!cancellationTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setCancellationTarget(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cancellationTarget, busy]);

  async function reserve(slot: Slot) {
    setBusy(true); setError(''); setMessage(''); setConfirmation(null);
    try {
      let confirmedAppointment: Appointment;
      let kind: AppointmentConfirmation['kind'];
      if (reschedulingId) {
        const result = await api<{ appointment: Appointment }>(`/appointments/${reschedulingId}/reschedule`, { method: 'PATCH', body: JSON.stringify({ slotId: slot.slotId }) });
        confirmedAppointment = result.appointment;
        kind = 'rescheduled';
        setMessage('La cita quedó reprogramada. El horario anterior ya está libre.'); setReschedulingId('');
      } else {
        confirmedAppointment = await api<Appointment>('/appointments', { method: 'POST', body: JSON.stringify({ slotId: slot.slotId, patientDocument: isAppointmentManager ? patientDocument : undefined }) });
        kind = 'booked';
        setMessage('Cita agendada. Guarda la fecha y hora de confirmación.');
      }
      setConfirmation({ kind, appointment: confirmedAppointment });
      await Promise.all([loadAppointments(), loadSlots()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cita.'); await loadSlots(); }
    finally { setBusy(false); }
  }

  async function cancel(appointment: Appointment, reason: string) {
    setBusy(true); setError(''); setMessage(''); setConfirmation(null);
    try {
      const cancelled = await api<Appointment>(`/appointments/${appointment.id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setConfirmation({ kind: 'cancelled', appointment: cancelled });
      setMessage('Cita cancelada y horario liberado.');
      setCancellationTarget(null); setCancellationReason(''); setCancellationError('');
      await Promise.all([loadAppointments(), loadSlots()]);
    } catch (cause) { setCancellationError(cause instanceof Error ? cause.message : 'No se pudo cancelar la cita.'); }
    finally { setBusy(false); }
  }

  async function setAppointmentStatus(appointment: Appointment, status: 'COMPLETED' | 'NO_SHOW') {
    try {
      await api(`/appointments/${appointment.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setMessage(status === 'COMPLETED' ? 'Cita marcada como realizada.' : 'Cita marcada como inasistencia.'); await loadAppointments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la cita.'); }
  }

  async function generateReport(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const params = new URLSearchParams({ from: reportFrom, to: reportTo });
      setReport(await api<Report>(`/reports?${params.toString()}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo generar el reporte.'); }
  }

  const title = user.role === 'DOCTOR' ? 'Agenda asistencial' : user.role === 'ADMIN' ? 'Centro de control' : user.role === 'RECEPTIONIST' ? 'Apoyo de agendamiento' : 'Mis citas';
  return <div className={`app-shell ${isPatient ? 'patient-app-shell' : ''}`}>
    <header className="topbar">
      <a className="brand-link" href="#top" aria-label="SAVCM, ir al inicio"><Brand /></a>
      {isPatient ? <div className="topbar-right patient-topbar-right">
        <button className="role-pill patient-role-pill" onClick={() => navigatePatient('profile')}><Icon name="user" />Paciente</button>
        <button className="patient-user-menu" onClick={() => setProfileOpen(true)}>{user.firstName} {user.lastName}<Icon name="chevron" /></button>
        <span className="topbar-divider" />
        <button className="patient-signout" onClick={onSignOut}><Icon name="logout" /><span>Cerrar sesión</span></button>
      </div> : <div className="topbar-right"><span className="role-pill">{roleName(user.role)}</span><span className="user-name">{user.firstName} {user.lastName}</span><button className="button quiet" onClick={onSignOut}>Cerrar sesión</button></div>}
    </header>
    {isPatient && <nav className="patient-sidebar" aria-label="Navegación principal">
      <button className={`patient-nav-link ${patientNavItem === 'home' ? 'active' : ''}`} onClick={() => navigatePatient('home')}><Icon name="home" />Inicio</button>
      <button className={`patient-nav-link ${patientNavItem === 'booking' ? 'active' : ''}`} onClick={() => navigatePatient('booking')}><Icon name="calendar" />Agendar cita</button>
      <button className={`patient-nav-link ${patientNavItem === 'appointments' ? 'active' : ''}`} onClick={() => navigatePatient('appointments')}><Icon name="calendar" />Mis citas</button>
      <button className={`patient-nav-link ${patientNavItem === 'history' ? 'active' : ''}`} onClick={() => navigatePatient('history')}><Icon name="clock" />Historial</button>
      <button className={`patient-nav-link ${patientNavItem === 'profile' ? 'active' : ''}`} onClick={() => navigatePatient('profile')}><Icon name="user" />Mi perfil</button>
      <div className="sidebar-care" aria-hidden="true"><img src="/doctor-illustration.png" alt="" /></div>
    </nav>}
    <main className={`dashboard ${isPatient ? 'patient-dashboard' : ''}`} id="top">
      <div className={`welcome-row ${isPatient ? 'patient-hero' : ''}`}>
        <div className="welcome-copy">
          <p className="eyebrow">{isPatient ? 'TU ESPACIO DE ATENCIÓN' : `PORTAL DE SALUD · ${today()}`}</p>
          <h1>{isPatient ? <>¡Hola, {firstName}<span className="period">!</span></> : <>{title}<span className="period">.</span></>}</h1>
          <p className="muted">{isPatient ? 'Gestiona tus citas médicas de forma rápida y sencilla.' : user.role === 'DOCTOR' ? 'Revisa tu programación y registra el resultado de cada atención.' : 'Administra la operación de citas de medicina general.'}</p>
          {isPatient && <button className="hero-link" onClick={() => navigatePatient('booking')}>Agendar una cita <span aria-hidden="true">→</span></button>}
        </div>
        {!isPatient && <div className="welcome-stamp"><span>Atención</span><strong>General</strong><small>Disponible 24/7</small></div>}
      </div>
      {isPatient && <section className="patient-summary" aria-label="Resumen de tus citas">
        <article className="summary-card next-summary"><div className="summary-card-top"><span className="summary-icon"><Icon name="calendar" /></span><span>PRÓXIMA CITA</span></div><strong className="next-date">{nextAppointment ? dateLabel(nextAppointment.date) : 'Aún sin cita'}</strong><p>{nextAppointment ? `${nextAppointment.startTime.slice(0, 5)} · Dr(a). ${nextAppointment.doctorFirstName} ${nextAppointment.doctorLastName}` : 'Elige un horario y aparecerá aquí.'}</p><span className="summary-illustration"><Icon name="calendar" /></span></article>
        <article className="summary-card availability-summary"><div className="summary-card-top"><span className="summary-icon"><Icon name="clock" /></span><span>DISPONIBILIDAD</span></div><strong className="summary-value">{visibleSlots.length}</strong><p>Horarios para {dateLabel(date)}</p><span className="summary-illustration muted-icon"><Icon name="clock" /></span></article>
        <article className="summary-note"><span className="summary-note-mark"><Icon name="bolt" /></span><div><strong>Tu tiempo, a tu ritmo.</strong><p>Agenda, reprograma o cancela en línea.</p></div><span className="note-illustration"><Icon name="calendar" /></span></article>
      </section>}
      {message && <div className="notice success" role="status">{message}<button aria-label="Cerrar" onClick={() => setMessage('')}>×</button></div>}
      {error && <div className="notice error" role="alert">{error}<button aria-label="Cerrar" onClick={() => setError('')}>×</button></div>}
      {confirmation && <AppointmentConfirmationCard confirmation={confirmation} onClose={() => setConfirmation(null)} />}

      {(canBook || user.role === 'DOCTOR') && <section className="content-grid">
        {canBook && <article className="card scheduling-card" id="scheduling">
          <div className="section-heading"><div className="section-title-with-icon">{isPatient && <span className="section-icon"><Icon name="calendar" /></span>}<div><p className="eyebrow">01 · DISPONIBILIDAD</p><h2>{reschedulingId ? 'Elige un nuevo horario' : 'Encuentra tu cita'}</h2>{isPatient && <p className="section-subtitle">Selecciona la fecha y el médico de tu preferencia.</p>}</div></div><span className="live-dot">Actualizada</span></div>
          {reschedulingId && <div className="inline-callout">Selecciona un horario libre para reemplazar la cita elegida. <button onClick={() => setReschedulingId('')}>Salir</button></div>}
          <div className="filters">
            <label>Fecha<input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>Médico<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}><option value="">Todos los médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
          </div>
          {isAppointmentManager && <label className="patient-target">Cédula del paciente para reservar<input inputMode="numeric" value={patientDocument} onChange={(event) => setPatientDocument(event.target.value)} placeholder="Debe tener cuenta activa en SAVCM" /></label>}
          <div className="slots-heading"><strong>{visibleSlots.length} horarios disponibles</strong><span>{dateLabel(date)}</span></div>
          {visibleSlots.length === 0 ? <div className="empty-state"><span className="empty-icon">◷</span><strong>{slots.length === 0 ? 'No hay horarios para esta fecha' : 'Todos los horarios ya están ocupados'}</strong><p>Busca otro día con agenda disponible.</p><button className="empty-action" onClick={() => setDate(nextBusinessDay(date))}>Ver siguiente día hábil <span aria-hidden="true">→</span></button></div> : <div className="slots-list">{visibleSlots.map((slot) => <div className="slot-row" key={slot.slotId}>
            <div className="slot-time"><strong>{slot.startTime.slice(0, 5)}</strong><span>– {slot.endTime.slice(0, 5)}</span></div>
            <div className="slot-doctor"><strong>Dr(a). {slot.doctorFirstName} {slot.doctorLastName}</strong><span>{slot.specialty || 'Medicina General'}{slot.room ? ` · ${slot.room}` : ''}</span></div>
            <button className="button small primary" disabled={busy || (isAppointmentManager && !patientDocument.trim())} onClick={() => void reserve(slot)}>{reschedulingId ? 'Elegir' : 'Agendar'}</button>
          </div>)}</div>}
        </article>}
        <article className="card appointments-card" id={isPatient ? 'appointments' : undefined}>
          <div className="section-heading"><div className="section-title-with-icon">{isPatient && <span className="section-icon"><Icon name="calendar" /></span>}<div><p className="eyebrow">{user.role === 'DOCTOR' ? '01 · JORNADA' : '02 · SEGUIMIENTO'}</p><h2>{isPatient ? 'Mis citas' : user.role === 'DOCTOR' ? 'Citas de la agenda' : 'Historial de citas'}</h2>{isPatient && <p className="section-subtitle">Consulta y gestiona tus citas programadas.</p>}</div></div><button className="refresh-button" onClick={() => void loadAppointments()} aria-label="Actualizar citas"><Icon name="refresh" /></button></div>
          {isPatient && <div className="patient-appointment-tabs" role="tablist" aria-label="Filtrar citas">
            <button role="tab" aria-selected={patientAppointmentView === 'upcoming'} className={patientAppointmentView === 'upcoming' ? 'active' : ''} onClick={() => setPatientAppointmentView('upcoming')}><Icon name="calendar" />Próximas ({upcomingAppointments.length})</button>
            <button role="tab" aria-selected={patientAppointmentView === 'history'} className={patientAppointmentView === 'history' ? 'active' : ''} onClick={() => setPatientAppointmentView('history')}><Icon name="clock" />Anteriores</button>
            <button role="tab" aria-selected={patientAppointmentView === 'cancelled'} className={patientAppointmentView === 'cancelled' ? 'active' : ''} onClick={() => setPatientAppointmentView('cancelled')}><Icon name="closeCircle" />Canceladas</button>
          </div>}
          {user.role === 'DOCTOR' && <div className="doctor-agenda-filter"><label>Fecha de inicio<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="range-toggle"><button className={doctorRange === 'day' ? 'active' : ''} onClick={() => setDoctorRange('day')}>Día</button><button className={doctorRange === 'week' ? 'active' : ''} onClick={() => setDoctorRange('week')}>Semana</button></div></div>}
          {(isPatient ? patientVisibleAppointments : appointments).length === 0 ? <div className="empty-state compact"><span className="empty-icon">▤</span><strong>{isPatient && patientAppointmentView === 'cancelled' ? 'No hay citas canceladas' : isPatient && patientAppointmentView === 'history' ? 'Aún no tienes citas anteriores' : 'Aún no hay citas'}</strong><p>{isPatient && patientAppointmentView === 'upcoming' ? 'Tu próxima reserva aparecerá aquí con todos sus detalles.' : isPatient ? 'Cuando haya citas en esta sección, aparecerán aquí.' : 'Aquí verás las citas registradas en el sistema.'}</p>{isPatient && patientAppointmentView === 'upcoming' && <button className="empty-action" onClick={() => navigatePatient('booking')}>Agendar mi primera cita <span aria-hidden="true">→</span></button>}</div> : <div className="appointment-list">{(isPatient ? patientVisibleAppointments : appointments).map((appointment) => <div className="appointment-item" key={appointment.id}>
            <div className="appointment-date"><strong>{dateKey(appointment.date).slice(8, 10) || '—'}</strong><span>{monthShort(appointment.date)}</span></div>
            <div className="appointment-info"><div className="appointment-line"><strong>{appointment.startTime.slice(0, 5)} · {appointment.patientFirstName} {appointment.patientLastName}</strong><StatusPill status={appointment.status} /></div><span>{appointment.doctorFirstName} {appointment.doctorLastName} · Medicina General</span><small>Cédula {appointment.patientDocument}{appointment.defaultRoom ? ` · ${appointment.defaultRoom}` : ''}</small>
              <div className="appointment-actions">
                {(user.role === 'PATIENT' || isAppointmentManager) && appointment.status === 'SCHEDULED' && <><button onClick={() => { setReschedulingId(appointment.id); document.querySelector('.scheduling-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Reprogramar</button><button className="danger-link" onClick={() => { setCancellationTarget(appointment); setCancellationReason(''); setCancellationError(''); }}>Cancelar</button></>}
                {user.role === 'DOCTOR' && appointment.status === 'SCHEDULED' && <><button onClick={() => void setAppointmentStatus(appointment, 'COMPLETED')}>Marcar realizada</button><button className="danger-link" onClick={() => void setAppointmentStatus(appointment, 'NO_SHOW')}>No asistió</button></>}
              </div>
            </div>
          </div>)}</div>}
        </article>
      </section>}

      {user.role === 'ADMIN' && <AdminTools doctors={doctors} onDoctorsChanged={loadDoctors} onScheduleCreated={(nextDate, nextDoctor) => { setDate(nextDate); setDoctorId(nextDoctor); }} report={report} reportFrom={reportFrom} setReportFrom={setReportFrom} reportTo={reportTo} setReportTo={setReportTo} onGenerateReport={generateReport} setMessage={setMessage} setError={setError} />}
      <footer className="app-footer"><span>SAVCM · Sistema de agendamiento virtual</span><span>La información de esta plataforma es confidencial.</span></footer>
    </main>
    {profileOpen && isPatient && <div className="modal-backdrop profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setProfileOpen(false)}>×</button>
        <span className="profile-avatar"><Icon name="user" /></span><p className="eyebrow">MI CUENTA</p><h2 id="profile-title">Mi perfil</h2>
        <div className="profile-details"><span>Nombre</span><strong>{user.firstName} {user.lastName}</strong><span>Correo electrónico</span><strong>{user.email}</strong><span>Documento</span><strong>{user.documentType} {user.documentId}</strong><span>Tipo de cuenta</span><strong>Paciente SAVCM</strong></div>
        <button className="button primary full" onClick={() => setProfileOpen(false)}>Listo</button>
      </section>
    </div>}
    {cancellationTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCancellationTarget(null); }}>
      <section className="cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description">
        <button className="dialog-close" type="button" aria-label="Cerrar" disabled={busy} onClick={() => setCancellationTarget(null)}>×</button>
        <span className="cancel-modal-icon" aria-hidden="true">×</span>
        <p className="eyebrow">GESTIÓN DE CITAS</p>
        <h2 id="cancel-title">Cancelar esta cita</h2>
        <p className="dialog-description" id="cancel-description">Cuéntanos brevemente por qué necesitas cancelarla. El horario quedará libre para otro paciente.</p>
        <div className="cancel-appointment-summary">
          <span>Fecha y hora</span><strong>{dateLabel(cancellationTarget.date)} · {cancellationTarget.startTime.slice(0, 5)}</strong>
          <span>Médico</span><strong>Dr(a). {cancellationTarget.doctorFirstName} {cancellationTarget.doctorLastName}</strong>
        </div>
        <form className="cancel-form" onSubmit={(event) => { event.preventDefault(); void cancel(cancellationTarget, cancellationReason); }}>
          <label htmlFor="cancellation-reason">Motivo de cancelación</label>
          <textarea id="cancellation-reason" autoFocus required maxLength={500} rows={4} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Escribe el motivo aquí…" />
          <small>Este motivo quedará asociado al registro de la cita.</small>
          {cancellationError && <div className="notice error" role="alert">{cancellationError}</div>}
          <div className="modal-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={() => setCancellationTarget(null)}>Volver</button>
            <button className="button cancel-confirm" type="submit" disabled={busy || !cancellationReason.trim()}>{busy ? 'Cancelando…' : 'Confirmar cancelación'}</button>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}

function AppointmentConfirmationCard({ confirmation, onClose }: { confirmation: AppointmentConfirmation; onClose: () => void }) {
  const { appointment, kind } = confirmation;
  const heading = kind === 'cancelled' ? 'Comprobante de cancelación' : kind === 'rescheduled' ? 'Cita reprogramada' : 'Cita confirmada';
  return <section className={`appointment-confirmation ${kind}`} role="status" aria-live="polite">
    <button className="confirmation-close" aria-label="Cerrar comprobante" onClick={onClose}>×</button>
    <p className="eyebrow">{kind === 'cancelled' ? 'GESTIÓN DE CITAS' : 'CONFIRMACIÓN EN PANTALLA'}</p>
    <h2>{heading}</h2>
    <div className="confirmation-code">Código <strong>{appointment.id.slice(0, 8).toUpperCase()}</strong></div>
    <div className="confirmation-details">
      <span>Fecha<strong>{dateLabel(appointment.date)}</strong></span>
      <span>Hora<strong>{appointment.startTime.slice(0, 5)} – {appointment.endTime.slice(0, 5)}</strong></span>
      <span>Médico<strong>Dr(a). {appointment.doctorFirstName} {appointment.doctorLastName}</strong></span>
      {appointment.defaultRoom && <span>Consultorio<strong>{appointment.defaultRoom}</strong></span>}
    </div>
    {kind === 'cancelled' && appointment.cancellationReason && <p className="confirmation-reason">Motivo: {appointment.cancellationReason}</p>}
  </section>;
}

function Icon({ name }: { name: 'home' | 'calendar' | 'clock' | 'user' | 'logout' | 'bolt' | 'refresh' | 'chevron' | 'closeCircle' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const drawings = {
    home: <><path {...common} d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /><path {...common} d="M2 10.5 12 3l10 7.5" /></>,
    calendar: <><rect {...common} x="3" y="5" width="18" height="16" rx="2.5" /><path {...common} d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
    clock: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M12 7v5l3.5 2" /></>,
    user: <><circle {...common} cx="12" cy="8" r="3.5" /><path {...common} d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
    logout: <><path {...common} d="M10 17l5-5-5-5M15 12H3" /><path {...common} d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    bolt: <path {...common} d="m13 2-9 12h7l-1 8 10-13h-7z" />,
    refresh: <><path {...common} d="M20 7v5h-5M4 17v-5h5" /><path {...common} d="M5.7 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.3-3" /></>,
    chevron: <path {...common} d="m7 10 5 5 5-5" />,
    closeCircle: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="m9 9 6 6m0-6-6 6" /></>,
  };
  return <svg className={`icon icon-${name}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">{drawings[name]}</svg>;
}

function AdminTools({ doctors, onDoctorsChanged, onScheduleCreated, report, reportFrom, setReportFrom, reportTo, setReportTo, onGenerateReport, setMessage, setError }: { doctors: Doctor[]; onDoctorsChanged: () => Promise<void>; onScheduleCreated: (date: string, doctorId: string) => void; report: Report | null; reportFrom: string; setReportFrom: (value: string) => void; reportTo: string; setReportTo: (value: string) => void; onGenerateReport: (event: FormEvent) => Promise<void>; setMessage: (value: string) => void; setError: (value: string) => void }) {
  const [schedule, setSchedule] = useState({ doctorId: '', date: today(), startTime: '08:00', endTime: '12:00', slotMinutes: 30, room: '' });
  const [doctor, setDoctor] = useState({ documentId: '', firstName: '', lastName: '', email: '', password: '', room: '' });
  const [staff, setStaff] = useState({ documentId: '', firstName: '', lastName: '', email: '', password: '' });
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [roster, setRoster] = useState<RosterPatient[]>([]);
  const [rosterDocument, setRosterDocument] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([api<ManagedUser[]>('/admin/users'), api<RosterPatient[]>('/admin/eps-roster')])
      .then(([users, patients]) => { setManagedUsers(users); setRoster(patients); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la administración.'));
  }, []);
  async function createSchedule(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<unknown[]>('/schedules', { method: 'POST', body: JSON.stringify(schedule) });
      onScheduleCreated(schedule.date, schedule.doctorId);
      setMessage(`Agenda creada con ${result.length} bloques disponibles.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la agenda.'); }
    finally { setBusy(false); }
  }
  async function createDoctor(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/doctors', { method: 'POST', body: JSON.stringify({ ...doctor, specialty: 'Medicina General' }) });
      setDoctor({ documentId: '', firstName: '', lastName: '', email: '', password: '', room: '' });
      setMessage('Médico registrado. Ya puedes configurar su agenda.'); await onDoctorsChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar el médico.'); }
    finally { setBusy(false); }
  }
  async function createReceptionist(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/admin/users/receptionists', { method: 'POST', body: JSON.stringify(staff) });
      setStaff({ documentId: '', firstName: '', lastName: '', email: '', password: '' });
      setMessage('Cuenta de recepción creada.'); setManagedUsers(await api<ManagedUser[]>('/admin/users'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.'); }
    finally { setBusy(false); }
  }
  async function addRosterPatient(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await api('/admin/eps-roster', { method: 'POST', body: JSON.stringify({ documentId: rosterDocument }) });
      setRosterDocument(''); setRoster(await api<RosterPatient[]>('/admin/eps-roster')); setMessage('Cédula agregada al padrón activo.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el padrón.'); }
  }
  async function changeRosterStatus(patient: RosterPatient) {
    try {
      await api(`/admin/eps-roster/${patient.documentId}/active`, { method: 'PATCH', body: JSON.stringify({ active: !patient.active }) });
      setRoster(await api<RosterPatient[]>('/admin/eps-roster')); setMessage(patient.active ? 'Cédula desactivada y cuenta de paciente suspendida.' : 'Cédula habilitada para nuevos registros.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el padrón.'); }
  }
  async function changeUserStatus(item: ManagedUser) {
    try {
      await api(`/admin/users/${item.id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setManagedUsers(await api<ManagedUser[]>('/admin/users')); setMessage(item.active ? 'Cuenta desactivada.' : 'Cuenta activada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el usuario.'); }
  }
  return <section className="admin-tools">
    <div className="section-divider"><span>ADMINISTRACIÓN</span><i /></div>
    <div className="admin-grid">
      <article className="card admin-card"><div className="section-heading"><div><p className="eyebrow">03 · CONFIGURACIÓN</p><h2>Crear una agenda</h2></div><span className="icon-bubble">◷</span></div>
        {doctors.length === 0 ? <p className="muted">Registra un médico para empezar a abrir horarios.</p> : <form className="form-stack compact-form" onSubmit={createSchedule}>
          <label>Médico<select required value={schedule.doctorId} onChange={(e) => setSchedule({ ...schedule, doctorId: e.target.value })}><option value="">Selecciona médico</option>{doctors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Fecha<input required type="date" min={today()} value={schedule.date} onChange={(e) => setSchedule({ ...schedule, date: e.target.value })} /></label>
          <div className="form-row"><label>Desde<input required type="time" value={schedule.startTime} onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })} /></label><label>Hasta<input required type="time" value={schedule.endTime} onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })} /></label></div>
          <div className="form-row"><label>Duración<select value={schedule.slotMinutes} onChange={(e) => setSchedule({ ...schedule, slotMinutes: Number(e.target.value) })}><option value={20}>20 minutos</option><option value={30}>30 minutos</option><option value={40}>40 minutos</option><option value={60}>60 minutos</option></select></label><label>Consultorio<input value={schedule.room} onChange={(e) => setSchedule({ ...schedule, room: e.target.value })} placeholder="Ej. Consultorio 2" /></label></div>
          <button className="button primary" disabled={busy || !schedule.doctorId}>Generar bloques</button>
        </form>}
      </article>
      <article className="card admin-card"><div className="section-heading"><div><p className="eyebrow">04 · TALENTO HUMANO</p><h2>Registrar médico</h2></div><span className="icon-bubble">✳</span></div>
        <form className="form-stack compact-form" onSubmit={createDoctor}>
          <label>Cédula<input required inputMode="numeric" value={doctor.documentId} onChange={(e) => setDoctor({ ...doctor, documentId: e.target.value })} /></label>
          <div className="form-row"><label>Nombres<input required value={doctor.firstName} onChange={(e) => setDoctor({ ...doctor, firstName: e.target.value })} /></label><label>Apellidos<input required value={doctor.lastName} onChange={(e) => setDoctor({ ...doctor, lastName: e.target.value })} /></label></div>
          <label>Correo<input required type="email" value={doctor.email} onChange={(e) => setDoctor({ ...doctor, email: e.target.value })} /></label>
          <div className="form-row"><label>Contraseña temporal<input required minLength={8} type="password" value={doctor.password} onChange={(e) => setDoctor({ ...doctor, password: e.target.value })} /></label><label>Consultorio<input value={doctor.room} onChange={(e) => setDoctor({ ...doctor, room: e.target.value })} /></label></div>
          <button className="button secondary" disabled={busy}>Guardar médico</button>
        </form>
      </article>
    </div>
    <div className="admin-grid management-grid">
      <article className="card admin-card"><div className="section-heading"><div><p className="eyebrow">05 · VALIDACIÓN EPS</p><h2>Padrón de cédulas</h2></div><span className="icon-bubble">⌕</span></div>
        <form className="roster-form" onSubmit={(event) => void addRosterPatient(event)}><label>Nueva cédula autorizada<input required inputMode="numeric" value={rosterDocument} onChange={(event) => setRosterDocument(event.target.value)} /></label><button className="button secondary">Agregar</button></form>
        <div className="management-list">{roster.map((patient) => <div className="management-row" key={patient.documentId}><span>{patient.documentId}</span><span className={patient.active ? 'active-label' : 'inactive-label'}>{patient.active ? 'Activa' : 'Inactiva'}</span><button onClick={() => void changeRosterStatus(patient)}>{patient.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
      </article>
      <article className="card admin-card"><div className="section-heading"><div><p className="eyebrow">06 · ACCESOS</p><h2>Usuarios y roles</h2></div><span className="icon-bubble">◉</span></div>
        <form className="form-stack compact-form" onSubmit={(event) => void createReceptionist(event)}>
          <div className="form-row"><label>Cédula<input required inputMode="numeric" value={staff.documentId} onChange={(event) => setStaff({ ...staff, documentId: event.target.value })} /></label><label>Correo<input required type="email" value={staff.email} onChange={(event) => setStaff({ ...staff, email: event.target.value })} /></label></div>
          <div className="form-row"><label>Nombres<input required value={staff.firstName} onChange={(event) => setStaff({ ...staff, firstName: event.target.value })} /></label><label>Apellidos<input required value={staff.lastName} onChange={(event) => setStaff({ ...staff, lastName: event.target.value })} /></label></div>
          <div className="form-row"><label>Contraseña temporal<input required minLength={8} type="password" value={staff.password} onChange={(event) => setStaff({ ...staff, password: event.target.value })} /></label><div className="role-fixed"><span>Rol</span><strong>Recepción</strong></div></div>
          <button className="button secondary" disabled={busy}>Crear cuenta de recepción</button>
        </form>
        <div className="management-list user-list">{managedUsers.map((item) => <div className="management-row" key={item.id}><span className="user-list-name">{item.firstName} {item.lastName}<small>{roleName(item.role)} · {item.documentId}</small></span><span className={item.active ? 'active-label' : 'inactive-label'}>{item.active ? 'Activa' : 'Inactiva'}</span><button onClick={() => void changeUserStatus(item)}>{item.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
      </article>
    </div>
    <article className="card report-card"><div className="section-heading"><div><p className="eyebrow">07 · INDICADORES</p><h2>Reporte administrativo</h2></div><span className="icon-bubble">↗</span></div>
      <form className="report-filter" onSubmit={(event) => void onGenerateReport(event)}><label>Desde<input type="date" required value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label><label>Hasta<input type="date" required value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label><button className="button primary">Generar reporte</button></form>
      {report ? <><div className="metric-grid"><Metric value={report.totals.total} label="Citas registradas" /><Metric value={`${report.agendaOccupancyPercent}%`} label="Ocupación de agenda" /><Metric value={`${report.absenceRatePercent}%`} label="Tasa de ausentismo" /><Metric value={`${report.cancellationAndReschedulePercent}%`} label="Cancelación / reprogramación" /></div><div className="report-status">{[['Agendadas', report.totals.scheduled], ['Canceladas', report.totals.cancelled], ['Reprogramadas', report.totals.rescheduled], ['Realizadas', report.totals.completed], ['No asistió', report.totals.noShow]].map(([label, value]) => <span key={label}>{label}<strong>{value}</strong></span>)}</div>
        {report.doctors.length > 0 && <div className="doctor-occupancy"><strong>Ocupación por médico</strong>{report.doctors.map((item) => <div className="occupancy-row" key={item.doctorId}><span>{item.doctor}</span><div className="progress"><i style={{ width: `${Math.min(item.occupancyPercent, 100)}%` }} /></div><b>{item.occupancyPercent}%</b><small>{item.reservedSlots}/{item.offeredSlots}</small></div>)}</div>}</> : <p className="muted report-placeholder">Selecciona un rango para consultar demanda, ausentismo y ocupación.</p>}
    </article>
  </section>;
}

function Metric({ value, label }: { value: string | number; label: string }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div>; }
function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { SCHEDULED: 'Agendada', CANCELLED: 'Cancelada', RESCHEDULED: 'Reprogramada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió' };
  return <span className={`status-pill status-${status.toLowerCase()}`}>{labels[status] || status}</span>;
}
function dateKey(value: string | null | undefined) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}
function parseLocalDate(value: string | null | undefined) {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}
function dateLabel(value: string) {
  return parseLocalDate(value)?.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) || 'Fecha por confirmar';
}
function monthShort(value: string) {
  return parseLocalDate(value)?.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '') || '—';
}
function nextBusinessDay(value: string) {
  const next = new Date(`${value}T12:00:00`);
  do { next.setDate(next.getDate() + 1); } while (next.getDay() === 0 || next.getDay() === 6);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}
function addDays(value: string, days: number) {
  const dateValue = new Date(`${value}T12:00:00`);
  dateValue.setDate(dateValue.getDate() + days);
  const local = new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default App;
