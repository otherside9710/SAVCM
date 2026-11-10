import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Brand } from './components/Brand';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';
type User = { sub: string; documentType: string; documentId: string; email: string; firstName: string; lastName: string; role: Role; doctorId?: string };
type Session = { accessToken: string; user: User };
type Doctor = { id: string; name: string; email: string; specialty: string; defaultRoom?: string };
type Slot = { slotId: string; doctorId: string; doctorFirstName: string; doctorLastName: string; specialty: string; date: string; startTime: string; endTime: string; room: string | null; available: boolean };
type Appointment = { id: string; slotId: string; date: string; startTime: string; endTime: string; status: string; cancellationReason?: string | null; cancellationSource?: 'DOCTOR' | 'PATIENT' | 'STAFF' | null; notificationSent?: boolean; patientDocument: string; patientFirstName: string; patientLastName: string; doctorId: string; doctorFirstName: string; doctorLastName: string; specialty: string; defaultRoom?: string };
type AdminAgendaSlot = { slotId: string; date: string; startTime: string; endTime: string; room: string | null; slotActive: boolean; doctorId: string; doctorActive: boolean; specialty: string; doctorFirstName: string; doctorLastName: string; appointmentId: string | null; patientDocument: string | null; patientFirstName: string | null; patientLastName: string | null };
type Report = { totals: { total: number; scheduled: number; cancelled: number; rescheduled: number; completed: number; noShow: number }; absenceRatePercent: number; cancellationAndReschedulePercent: number; agendaOccupancyPercent: number; doctors: Array<{ doctorId: string; doctor: string; offeredSlots: number; reservedSlots: number; occupancyPercent: number }> };
type AppointmentConfirmation = { kind: 'booked' | 'rescheduled' | 'cancelled'; appointment: Appointment };
type ManagedUser = { id: string; documentId: string; email: string; firstName: string; lastName: string; role: Role; active: boolean };
type RosterPatient = { documentId: string; active: boolean };
type PatientCsvImportResult = { totalRows: number; created: number; skipped: number; setupLinksSent: number; setupLinkFailures: Array<{ row: number }>; errors: Array<{ row: number; message: string }> };
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
type PatientAppointmentView = 'upcoming' | 'history' | 'cancelled';
type PatientNavItem = 'home' | 'booking' | 'appointments' | 'history' | 'profile';
type AdminPage = 'overview' | 'doctors' | 'schedules' | 'agendas' | 'patients' | 'appointments' | 'reports';

const ADMIN_PAGE_COPY: Record<AdminPage, { title: string; description: string }> = {
  overview: { title: 'Resumen', description: 'Estado general de médicos, pacientes, horarios y citas.' },
  doctors: { title: 'Médicos', description: 'Crea cuentas médicas y administra su acceso al sistema.' },
  schedules: { title: 'Crear horarios', description: 'Configura fechas y bloques de atención para cada médico.' },
  agendas: { title: 'Agendas', description: 'Consulta disponibilidad, reservas y pacientes por horario.' },
  patients: { title: 'Pacientes', description: 'Administra las cuentas y el padrón de cédulas de la EPS.' },
  appointments: { title: 'Citas de pacientes', description: 'Busca y revisa las citas por paciente, médico, estado y fecha.' },
  reports: { title: 'Indicadores', description: 'Consulta ocupación, cancelaciones y actividad del sistema.' },
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('savcm-token');
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
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
  return ({ PATIENT: 'Paciente', DOCTOR: 'Médico general', ADMIN: 'Administración' })[role];
}

function isSupportedRole(role: string): role is Role {
  return ['PATIENT', 'DOCTOR', 'ADMIN'].includes(role);
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
    setForm((current) => ({ ...current, password: '' }));
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
      } else if (mode === 'login') {
        onSuccess(await api<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: form.identifier, password: form.password }) }));
      } else {
        const result = await api<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ documentType: 'CC', documentId: form.documentId, firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, birthDate: form.birthDate }) });
        setForm((current) => ({ ...current, identifier: current.email, password: '' }));
        setSuccessMessage(result.message);
        setMode('login');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo completar la solicitud.');
    } finally { setBusy(false); }
  }

  const heading = mode === 'login' ? 'Bienvenido de nuevo'
    : mode === 'register' ? 'Crea tu cuenta'
      : mode === 'forgot' ? 'Recupera tu contraseña' : 'Crea una contraseña nueva';
  const description = mode === 'login' ? 'Ingresa con la cédula o el correo registrado.'
    : mode === 'register' ? 'El registro está disponible para pacientes activos de la EPS. Te enviaremos un enlace para crear tu contraseña.'
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
          <button className="button primary full" type="submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Ingresar al portal' : mode === 'register' ? 'Crear cuenta y enviar enlace' : mode === 'forgot' ? 'Enviar enlace de recuperación' : 'Guardar nueva contraseña'}</button>
        </form>
        {(mode === 'login' || mode === 'register') && <>
          <div className="demo-hint"><strong>Entorno de demostración</strong><span>El padrón incluye cédulas ficticias de prueba. Consulta las cuentas de cada rol en el README.</span></div>
          <p className="privacy-note">Solo pacientes registrados en el padrón pueden crear una cuenta. La contraseña se establece desde un enlace seguro enviado al correo.</p>
        </>}
      </div>
    </section>
  </main>;
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { user } = session;
  const isAppointmentManager = user.role === 'ADMIN';
  const canBook = user.role === 'PATIENT';
  const [date, setDate] = useState(() => canBook ? nextBusinessDay(today()) : today());
  const [doctorRange, setDoctorRange] = useState<'day' | 'week' | 'upcoming'>('upcoming');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bookingTarget, setBookingTarget] = useState<Slot | null>(null);
  const [reschedulingTarget, setReschedulingTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => nextBusinessDay(today()));
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [selectedRescheduleSlotId, setSelectedRescheduleSlotId] = useState('');
  const rescheduleRequestId = useRef(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationError, setCancellationError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [reportFrom, setReportFrom] = useState(`${today().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(today());
  const [adminAppointmentFrom, setAdminAppointmentFrom] = useState(today());
  const [adminAppointmentTo, setAdminAppointmentTo] = useState(() => addDays(today(), 29));
  const [adminAppointmentDoctor, setAdminAppointmentDoctor] = useState('');
  const [adminAppointmentStatus, setAdminAppointmentStatus] = useState('ALL');
  const [adminAppointmentSearch, setAdminAppointmentSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [patientAppointmentView, setPatientAppointmentView] = useState<PatientAppointmentView>('upcoming');
  const [patientNavItem, setPatientNavItem] = useState<PatientNavItem>('home');
  const [adminPage, setAdminPage] = useState<AdminPage>('overview');
  const [profileOpen, setProfileOpen] = useState(false);
  const isPatient = user.role === 'PATIENT';
  const visibleSlots = useMemo(() => slots.filter((slot) => slot.available), [slots]);
  const visibleRescheduleSlots = useMemo(() => rescheduleSlots.filter((slot) => slot.available), [rescheduleSlots]);
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
  const adminVisibleAppointments = useMemo(() => appointments.filter((appointment) => {
    const appointmentDate = dateKey(appointment.date);
    const query = adminAppointmentSearch.trim().toLowerCase();
    const patientName = `${appointment.patientFirstName} ${appointment.patientLastName}`.toLowerCase();
    const statusMatches = adminAppointmentStatus === 'ALL' || appointment.status === adminAppointmentStatus;
    return appointmentDate >= adminAppointmentFrom && appointmentDate <= adminAppointmentTo
      && (!adminAppointmentDoctor || appointment.doctorId === adminAppointmentDoctor)
      && statusMatches
      && (!query || patientName.includes(query) || appointment.patientDocument.includes(query));
  }).sort((left, right) => `${dateKey(left.date)} ${left.startTime}`.localeCompare(`${dateKey(right.date)} ${right.startTime}`)), [appointments, adminAppointmentFrom, adminAppointmentTo, adminAppointmentDoctor, adminAppointmentStatus, adminAppointmentSearch]);
  const displayedAppointments = isPatient ? patientVisibleAppointments : user.role === 'ADMIN' ? adminVisibleAppointments : appointments;
  const doctorScheduledAppointments = appointments.filter((appointment) => appointment.status === 'SCHEDULED').length;
  const doctorClosedAppointments = appointments.filter((appointment) => ['COMPLETED', 'NO_SHOW'].includes(appointment.status)).length;
  const firstName = user.firstName.trim().split(/\s+/)[0] || 'bienvenido';

  function navigatePatient(item: PatientNavItem) {
    setPatientNavItem(item);
    if (item === 'profile') { setProfileOpen(true); return; }
    if (item === 'history') setPatientAppointmentView('history');
    else if (item === 'appointments') setPatientAppointmentView('upcoming');
    const target = item === 'booking' ? '#scheduling' : item === 'appointments' || item === 'history' ? '#appointments' : '#top';
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function navigateAdmin(page: AdminPage) {
    setAdminPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  async function loadRescheduleSlots() {
    if (!reschedulingTarget) return;
    const requestId = ++rescheduleRequestId.current;
    setRescheduleSlotsLoading(true);
    setRescheduleError('');
    setSelectedRescheduleSlotId('');
    if (!rescheduleDate) {
      setRescheduleSlots([]);
      setRescheduleError('Selecciona una fecha para consultar los horarios.');
      setRescheduleSlotsLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams({ date: rescheduleDate });
      if (rescheduleDoctorId) params.set('doctorId', rescheduleDoctorId);
      const result = await api<Slot[]>(`/schedules/available?${params.toString()}`);
      if (requestId === rescheduleRequestId.current) setRescheduleSlots(result);
    } catch (cause) {
      if (requestId === rescheduleRequestId.current) {
        setRescheduleSlots([]);
        setRescheduleError(cause instanceof Error ? cause.message : 'No se pudo consultar la disponibilidad.');
      }
    } finally { if (requestId === rescheduleRequestId.current) setRescheduleSlotsLoading(false); }
  }

  function openReschedule(appointment: Appointment) {
    setRescheduleDate(nextBusinessDay(today()));
    setRescheduleDoctorId('');
    setRescheduleSlots([]);
    setSelectedRescheduleSlotId('');
    setRescheduleError('');
    setReschedulingTarget(appointment);
  }

  async function loadAppointments() {
    const params = new URLSearchParams();
    if (user.role === 'DOCTOR') {
      params.set('from', date);
      params.set('to', doctorRange === 'day' ? date : addDays(date, doctorRange === 'week' ? 6 : 29));
    }
    try { setAppointments(await api<Appointment[]>(`/appointments${params.size ? `?${params.toString()}` : ''}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus citas.'); }
  }

  useEffect(() => { void loadDoctors(); void loadAppointments(); }, []);
  useEffect(() => { if (user.role === 'DOCTOR') void loadAppointments(); }, [date, doctorRange]);
  useEffect(() => { void loadSlots(); }, [date, doctorId]);
  useEffect(() => { if (reschedulingTarget) void loadRescheduleSlots(); }, [reschedulingTarget, rescheduleDate, rescheduleDoctorId]);
  useEffect(() => {
    if (!cancellationTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setCancellationTarget(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cancellationTarget, busy]);
  useEffect(() => {
    if (!reschedulingTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setReschedulingTarget(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [reschedulingTarget, busy]);

  async function reserve(slot: Slot) {
    const targetAppointment = reschedulingTarget;
    setBusy(true); setError(''); setRescheduleError(''); setMessage(''); setConfirmation(null);
    try {
      let confirmedAppointment: Appointment;
      let kind: AppointmentConfirmation['kind'];
      if (targetAppointment) {
        const result = await api<{ appointment: Appointment }>(`/appointments/${targetAppointment.id}/reschedule`, { method: 'PATCH', body: JSON.stringify({ slotId: slot.slotId }) });
        confirmedAppointment = result.appointment;
        kind = 'rescheduled';
        setMessage('La cita quedó reprogramada. El horario anterior ya está libre.');
        setReschedulingTarget(null); setSelectedRescheduleSlotId(''); setRescheduleSlots([]);
      } else {
        confirmedAppointment = await api<Appointment>('/appointments', { method: 'POST', body: JSON.stringify({ slotId: slot.slotId }) });
        kind = 'booked';
        setMessage('Cita agendada. Guarda la fecha y hora de confirmación.');
      }
      setConfirmation({ kind, appointment: confirmedAppointment });
      await Promise.all([loadAppointments(), loadSlots()]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar la cita.';
      if (targetAppointment) { await loadRescheduleSlots(); setRescheduleError(message); }
      else { setError(message); await loadSlots(); }
    }
    finally { setBusy(false); }
  }

  async function cancel(appointment: Appointment, reason: string) {
    setBusy(true); setError(''); setMessage(''); setConfirmation(null);
    try {
      const cancelled = await api<Appointment>(`/appointments/${appointment.id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: reason.trim() }) });
      setConfirmation({ kind: 'cancelled', appointment: cancelled });
      setMessage(user.role === 'DOCTOR'
        ? cancelled.notificationSent
          ? 'Cita cancelada. El paciente recibió el motivo por correo y también lo verá en su historial.'
          : 'Cita cancelada. El motivo quedó visible en el historial del paciente, pero no se pudo enviar el correo.'
        : 'Cita cancelada y horario liberado.');
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

  const appointmentsPanel = (
        <article className="card appointments-card" id={isPatient || user.role === 'ADMIN' ? 'appointments' : undefined}>
          <div className="section-heading"><div className="section-title-with-icon">{(isPatient || user.role === 'DOCTOR' || user.role === 'ADMIN') && <span className="section-icon"><Icon name="calendar" /></span>}<div><p className="eyebrow">{user.role === 'DOCTOR' ? '01 · JORNADA' : user.role === 'ADMIN' ? '02 · OPERACIÓN' : '02 · SEGUIMIENTO'}</p><h2>{isPatient ? 'Mis citas' : user.role === 'DOCTOR' ? 'Citas de la agenda' : user.role === 'ADMIN' ? 'Citas de pacientes' : 'Historial de citas'}</h2>{isPatient && <p className="section-subtitle">Consulta y gestiona tus citas programadas.</p>}{user.role === 'DOCTOR' && <p className="section-subtitle">Revisa cada atención, registra el resultado o avisa una cancelación.</p>}{user.role === 'ADMIN' && <p className="section-subtitle">Busca las citas por paciente, médico, estado y fecha.</p>}</div></div><button className="refresh-button" onClick={() => void loadAppointments()} aria-label="Actualizar citas"><Icon name="refresh" /></button></div>
          {isPatient && <div className="patient-appointment-tabs" role="tablist" aria-label="Filtrar citas">
            <button role="tab" aria-selected={patientAppointmentView === 'upcoming'} className={patientAppointmentView === 'upcoming' ? 'active' : ''} onClick={() => setPatientAppointmentView('upcoming')}><Icon name="calendar" />Próximas ({upcomingAppointments.length})</button>
            <button role="tab" aria-selected={patientAppointmentView === 'history'} className={patientAppointmentView === 'history' ? 'active' : ''} onClick={() => setPatientAppointmentView('history')}><Icon name="clock" />Anteriores</button>
            <button role="tab" aria-selected={patientAppointmentView === 'cancelled'} className={patientAppointmentView === 'cancelled' ? 'active' : ''} onClick={() => setPatientAppointmentView('cancelled')}><Icon name="closeCircle" />Canceladas</button>
          </div>}
          {user.role === 'DOCTOR' && <div className="doctor-agenda-filter"><label>Fecha de inicio<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="range-toggle"><button className={doctorRange === 'day' ? 'active' : ''} onClick={() => setDoctorRange('day')}>Día</button><button className={doctorRange === 'week' ? 'active' : ''} onClick={() => setDoctorRange('week')}>Semana</button><button className={doctorRange === 'upcoming' ? 'active' : ''} onClick={() => setDoctorRange('upcoming')}>Próximas 30 días</button></div></div>}
          {user.role === 'ADMIN' && <div className="admin-appointment-filters"><label>Desde<input type="date" value={adminAppointmentFrom} onChange={(event) => setAdminAppointmentFrom(event.target.value)} /></label><label>Hasta<input type="date" value={adminAppointmentTo} onChange={(event) => setAdminAppointmentTo(event.target.value)} /></label><label>Médico<select value={adminAppointmentDoctor} onChange={(event) => setAdminAppointmentDoctor(event.target.value)}><option value="">Todos los médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label><label>Estado<select value={adminAppointmentStatus} onChange={(event) => setAdminAppointmentStatus(event.target.value)}><option value="ALL">Todos</option><option value="SCHEDULED">Agendada</option><option value="RESCHEDULED">Reprogramada</option><option value="CANCELLED">Cancelada</option><option value="COMPLETED">Realizada</option><option value="NO_SHOW">No asistió</option></select></label><label className="admin-appointment-search">Paciente o cédula<input value={adminAppointmentSearch} onChange={(event) => setAdminAppointmentSearch(event.target.value)} placeholder="Buscar paciente" /></label><span className="admin-results-count">{adminVisibleAppointments.length} citas</span></div>}
          {displayedAppointments.length === 0 ? <div className={`empty-state compact ${user.role === 'DOCTOR' ? 'doctor-empty-state' : ''}`}><span className="empty-icon">▤</span><strong>{user.role === 'ADMIN' ? 'No hay citas con esos filtros' : isPatient && patientAppointmentView === 'cancelled' ? 'No hay citas canceladas' : isPatient && patientAppointmentView === 'history' ? 'Aún no tienes citas anteriores' : user.role === 'DOCTOR' ? 'Tu agenda está despejada' : 'Aún no hay citas'}</strong><p>{user.role === 'DOCTOR' ? `No hay pacientes programados ${doctorRange === 'day' ? 'para esta fecha' : doctorRange === 'week' ? 'esta semana' : 'en los próximos 30 días'}. Prueba con otro periodo.` : user.role === 'ADMIN' ? 'Amplía el periodo o cambia los filtros para ver otros resultados.' : isPatient && patientAppointmentView === 'upcoming' ? 'Tu próxima reserva aparecerá aquí con todos sus detalles.' : isPatient ? 'Cuando haya citas en esta sección, aparecerán aquí.' : 'Aquí verás las citas registradas en el sistema.'}</p>{isPatient && patientAppointmentView === 'upcoming' && <button className="empty-action" onClick={() => navigatePatient('booking')}>Agendar mi primera cita <span aria-hidden="true">→</span></button>}{user.role === 'DOCTOR' && <button className="empty-action" onClick={() => setDate(today())}>Volver a hoy <span aria-hidden="true">→</span></button>}</div> : <div className="appointment-list">{displayedAppointments.map((appointment) => {
            const cancellationTooLate = user.role === 'PATIENT' && minutesUntilAppointment(appointment) < 120;
            return <div className={`appointment-item ${user.role === 'DOCTOR' ? 'doctor-appointment-item' : ''}`} key={appointment.id}>
            <div className="appointment-date"><strong>{dateKey(appointment.date).slice(8, 10) || '—'}</strong><span>{monthShort(appointment.date)}</span></div>
            <div className="appointment-info"><div className="appointment-line"><strong>{user.role === 'DOCTOR' ? appointment.startTime.slice(0, 5) : `${appointment.startTime.slice(0, 5)} · ${appointment.patientFirstName} ${appointment.patientLastName}`}</strong><StatusPill status={appointment.status} cancellationSource={appointment.cancellationSource} isPatient={isPatient} /></div><span>{user.role === 'DOCTOR' ? `Paciente · ${appointment.patientFirstName} ${appointment.patientLastName}` : `${appointment.doctorFirstName} ${appointment.doctorLastName} · Medicina General`}</span><small>Cédula {appointment.patientDocument}{appointment.defaultRoom ? ` · ${appointment.defaultRoom}` : ''}</small>
              {isPatient && appointment.status === 'CANCELLED' && (appointment.cancellationReason || appointment.cancellationSource) && <div className={`patient-cancellation-message ${appointment.cancellationSource === 'DOCTOR' ? 'by-doctor' : ''}`}><strong>{appointment.cancellationSource === 'DOCTOR' ? 'Tu médico canceló esta cita' : appointment.cancellationSource === 'PATIENT' ? 'Cancelaste esta cita' : appointment.cancellationSource === 'STAFF' ? 'Cita cancelada por SAVCM' : 'Motivo informado'}</strong>{appointment.cancellationReason && <span>{appointment.cancellationReason}</span>}</div>}
              <div className="appointment-actions">
                {(user.role === 'PATIENT' || isAppointmentManager) && appointment.status === 'SCHEDULED' && <><button onClick={() => openReschedule(appointment)}>Reprogramar</button><button className="danger-link" disabled={cancellationTooLate} title={cancellationTooLate ? 'La cancelación debe hacerse con al menos 2 horas de anticipación.' : undefined} onClick={() => { setCancellationTarget(appointment); setCancellationReason(''); setCancellationError(''); }}>Cancelar</button>{cancellationTooLate && <small className="cancellation-window-note">Disponible hasta 2 horas antes de la cita</small>}</>}
                {user.role === 'DOCTOR' && appointment.status === 'SCHEDULED' && <>{appointmentTimePassed(appointment) && <><button onClick={() => void setAppointmentStatus(appointment, 'COMPLETED')}>Marcar realizada</button><button onClick={() => void setAppointmentStatus(appointment, 'NO_SHOW')}>No asistió</button></>}<button className="danger-link" onClick={() => { setCancellationTarget(appointment); setCancellationReason(''); setCancellationError(''); }}>Cancelar y avisar</button></>}
                {user.role === 'DOCTOR' && appointment.status === 'RESCHEDULED' && <button className="danger-link" onClick={() => { setCancellationTarget(appointment); setCancellationReason(''); setCancellationError(''); }}>Cancelar y avisar</button>}
              </div>
            </div>
          </div>;
          })}</div>}
        </article>
  );
  const title = user.role === 'DOCTOR' ? 'Agenda asistencial' : user.role === 'ADMIN' ? 'Centro de control' : 'Mis citas';
  return <div className={`app-shell ${isPatient ? 'patient-app-shell' : ''} ${user.role === 'DOCTOR' ? 'doctor-app-shell' : ''} ${user.role === 'ADMIN' ? 'admin-app-shell' : ''}`}>
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
    <main className={`dashboard ${isPatient ? 'patient-dashboard' : ''} ${user.role === 'DOCTOR' ? 'doctor-dashboard' : ''} ${user.role === 'ADMIN' ? 'admin-dashboard admin-page-dashboard' : ''}`} id="top">
      {user.role === 'ADMIN' ? <div className="admin-console">
        <AdminSidebar activePage={adminPage} onNavigate={navigateAdmin} />
        <section className="admin-main-content">
          <header className="admin-page-heading"><div><p className="eyebrow">ADMINISTRACIÓN SAVCM</p><h1>{ADMIN_PAGE_COPY[adminPage].title}</h1><p>{ADMIN_PAGE_COPY[adminPage].description}</p></div><span className="admin-live-tag"><i />Sistema operativo</span></header>
          {message && <div className="notice success" role="status">{message}<button aria-label="Cerrar" onClick={() => setMessage('')}>×</button></div>}
          {error && <div className="notice error" role="alert">{error}<button aria-label="Cerrar" onClick={() => setError('')}>×</button></div>}
          {confirmation && <AppointmentConfirmationCard confirmation={confirmation} onClose={() => setConfirmation(null)} />}
          {adminPage === 'appointments' && <section className="content-grid admin-content-grid">{appointmentsPanel}</section>}
          <AdminTools activePage={adminPage} appointments={appointments} doctors={doctors} onDoctorsChanged={loadDoctors} onScheduleCreated={(nextDate, nextDoctor) => { setDate(nextDate); setDoctorId(nextDoctor); }} report={report} reportFrom={reportFrom} setReportFrom={setReportFrom} reportTo={reportTo} setReportTo={setReportTo} onGenerateReport={generateReport} setMessage={setMessage} setError={setError} />
          <footer className="app-footer"><span>SAVCM · Sistema de agendamiento virtual</span><span>La información de esta plataforma es confidencial.</span></footer>
        </section>
      </div> : <>
        <div className={`welcome-row ${isPatient ? 'patient-hero' : ''} ${user.role === 'DOCTOR' ? 'doctor-hero' : ''}`}>
          <div className="welcome-copy">
            <p className="eyebrow">{isPatient ? 'TU ESPACIO DE ATENCIÓN' : `PORTAL DE SALUD · ${today()}`}</p>
            <h1>{isPatient ? <>¡Hola, {firstName}<span className="period">!</span></> : <>{title}<span className="period">.</span></>}</h1>
            <p className="muted">{isPatient ? 'Gestiona tus citas médicas de forma rápida y sencilla.' : 'Revisa tu programación y registra el resultado de cada atención.'}</p>
            {isPatient && <button className="hero-link" onClick={() => navigatePatient('booking')}>Agendar una cita <span aria-hidden="true">→</span></button>}
          </div>
          {user.role === 'DOCTOR' && <div className="welcome-stamp doctor-stamp"><span>Tu jornada</span><strong>Medicina</strong><small>Agenda personal</small></div>}
        </div>
        {isPatient && <section className="patient-summary" aria-label="Resumen de tus citas">
          <article className="summary-card next-summary"><div className="summary-card-top"><span className="summary-icon"><Icon name="calendar" /></span><span>PRÓXIMA CITA</span></div><strong className="next-date">{nextAppointment ? dateLabel(nextAppointment.date) : 'Aún sin cita'}</strong><p>{nextAppointment ? `${nextAppointment.startTime.slice(0, 5)} · Dr(a). ${nextAppointment.doctorFirstName} ${nextAppointment.doctorLastName}` : 'Elige un horario y aparecerá aquí.'}</p><span className="summary-illustration"><Icon name="calendar" /></span></article>
          <article className="summary-card availability-summary"><div className="summary-card-top"><span className="summary-icon"><Icon name="clock" /></span><span>DISPONIBILIDAD</span></div><strong className="summary-value">{visibleSlots.length}</strong><p>Horarios para {dateLabel(date)}</p><span className="summary-illustration muted-icon"><Icon name="clock" /></span></article>
          <article className="summary-note"><span className="summary-note-mark"><Icon name="bolt" /></span><div><strong>Tu tiempo, a tu ritmo.</strong><p>Agenda, reprograma o cancela en línea.</p></div><span className="note-illustration"><Icon name="calendar" /></span></article>
        </section>}
        {user.role === 'DOCTOR' && <section className="doctor-summary" aria-label="Resumen de la agenda">
          <article className="doctor-stat-card doctor-total"><span className="doctor-stat-icon"><Icon name="calendar" /></span><div><span>EN EL PERIODO</span><strong>{appointments.length}</strong><p>{doctorRange === 'day' ? 'citas para este día' : doctorRange === 'week' ? 'citas para esta semana' : 'citas en los próximos 30 días'}</p></div></article>
          <article className="doctor-stat-card doctor-pending"><span className="doctor-stat-icon"><Icon name="clock" /></span><div><span>PENDIENTES</span><strong>{doctorScheduledAppointments}</strong><p>por atender</p></div></article>
          <article className="doctor-stat-card doctor-closed"><span className="doctor-stat-icon"><Icon name="closeCircle" /></span><div><span>ATENCIONES CERRADAS</span><strong>{doctorClosedAppointments}</strong><p>realizadas o con inasistencia</p></div></article>
        </section>}
        {message && <div className="notice success" role="status">{message}<button aria-label="Cerrar" onClick={() => setMessage('')}>×</button></div>}
        {error && <div className="notice error" role="alert">{error}<button aria-label="Cerrar" onClick={() => setError('')}>×</button></div>}
        {confirmation && <AppointmentConfirmationCard confirmation={confirmation} onClose={() => setConfirmation(null)} />}
        <section className={`content-grid ${user.role === 'DOCTOR' ? 'doctor-content-grid' : ''}`}>
          {canBook && <article className="card scheduling-card" id="scheduling">
            <div className="section-heading"><div className="section-title-with-icon"><span className="section-icon"><Icon name="calendar" /></span><div><p className="eyebrow">01 · DISPONIBILIDAD</p><h2>Encuentra tu cita</h2><p className="section-subtitle">Selecciona la fecha y el médico de tu preferencia.</p></div></div><span className="live-dot">Actualizada</span></div>
            <div className="filters">
              <label>Fecha<input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label>Médico<select value={doctorId} onChange={(event) => setDoctorId(event.target.value)}><option value="">Todos los médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
            </div>
            <div className="slots-heading"><strong>{visibleSlots.length} horarios disponibles</strong><span>{dateLabel(date)}</span></div>
            {visibleSlots.length === 0 ? <div className="empty-state"><span className="empty-icon">◷</span><strong>{slots.length === 0 ? 'No hay horarios para esta fecha' : 'Todos los horarios ya están ocupados'}</strong><p>Busca otro día con agenda disponible.</p><button className="empty-action" onClick={() => setDate(nextBusinessDay(date))}>Ver siguiente día hábil <span aria-hidden="true">→</span></button></div> : <div className="slots-list">{visibleSlots.map((slot) => <div className="slot-row" key={slot.slotId}>
              <div className="slot-time"><strong>{slot.startTime.slice(0, 5)}</strong><span>– {slot.endTime.slice(0, 5)}</span></div>
              <div className="slot-doctor"><strong>Dr(a). {slot.doctorFirstName} {slot.doctorLastName}</strong><span>{slot.specialty || 'Medicina General'}{slot.room ? ` · ${slot.room}` : ''}</span></div>
              <button className="button small primary" disabled={busy} onClick={() => setBookingTarget(slot)}>Agendar</button>
            </div>)}</div>}
          </article>}
          {appointmentsPanel}
        </section>
        <footer className="app-footer"><span>SAVCM · Sistema de agendamiento virtual</span><span>La información de esta plataforma es confidencial.</span></footer>
      </>}
    </main>
    {reschedulingTarget && <div className="modal-backdrop reschedule-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReschedulingTarget(null); }}>
      <section className="reschedule-modal" role="dialog" aria-modal="true" aria-labelledby="reschedule-title" aria-describedby="reschedule-description">
        <button className="dialog-close" type="button" aria-label="Cerrar" disabled={busy} onClick={() => setReschedulingTarget(null)}>×</button>
        <div className="reschedule-modal-heading"><span className="reschedule-modal-icon"><Icon name="calendar" /></span><div><p className="eyebrow">CAMBIO DE CITA</p><h2 id="reschedule-title">Elige un nuevo horario</h2><p className="dialog-description" id="reschedule-description">La cita cambiará cuando confirmes el nuevo día, médico y hora.</p></div></div>
        <div className="reschedule-current"><span className="reschedule-current-label">CITA ACTUAL</span><strong>{dateLabel(reschedulingTarget.date)} · {reschedulingTarget.startTime.slice(0, 5)}</strong><span>Dr(a). {reschedulingTarget.doctorFirstName} {reschedulingTarget.doctorLastName}{reschedulingTarget.defaultRoom ? ` · ${reschedulingTarget.defaultRoom}` : ''}</span>{isAppointmentManager && <span>Paciente: {reschedulingTarget.patientFirstName} {reschedulingTarget.patientLastName} · Cédula {reschedulingTarget.patientDocument}</span>}</div>
        <div className="reschedule-filters">
          <label htmlFor="reschedule-date">Nueva fecha<input id="reschedule-date" type="date" min={today()} max={addDays(today(), 30)} value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} /></label>
          <label htmlFor="reschedule-doctor">Médico<select id="reschedule-doctor" value={rescheduleDoctorId} onChange={(event) => setRescheduleDoctorId(event.target.value)}><option value="">Todos los médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
        </div>
        <div className="reschedule-slots-heading"><strong>Horarios disponibles</strong><span>{rescheduleSlotsLoading ? 'Buscando…' : `${visibleRescheduleSlots.length} opciones · ${dateLabel(rescheduleDate)}`}</span></div>
        {rescheduleError && <div className="notice error reschedule-notice" role="alert">{rescheduleError}</div>}
        {rescheduleSlotsLoading ? <div className="reschedule-empty"><span className="loading-indicator" />Consultando horarios disponibles…</div>
          : visibleRescheduleSlots.length > 0 ? <div className="reschedule-slots" role="radiogroup" aria-label="Elige una nueva hora">
            {visibleRescheduleSlots.map((slot) => <button type="button" role="radio" aria-checked={selectedRescheduleSlotId === slot.slotId} className={`reschedule-slot ${selectedRescheduleSlotId === slot.slotId ? 'selected' : ''}`} key={slot.slotId} onClick={() => setSelectedRescheduleSlotId(slot.slotId)}>
              <span className="reschedule-slot-time"><Icon name="clock" /><strong>{slot.startTime.slice(0, 5)}</strong><small>– {slot.endTime.slice(0, 5)}</small></span>
              <span className="reschedule-slot-doctor"><strong>Dr(a). {slot.doctorFirstName} {slot.doctorLastName}</strong><small>{slot.specialty || 'Medicina General'}{slot.room ? ` · ${slot.room}` : ''}</small></span>
              <span className="reschedule-slot-check" aria-hidden="true">{selectedRescheduleSlotId === slot.slotId ? '✓' : ''}</span>
            </button>)}
          </div> : <div className="reschedule-empty"><span className="empty-icon"><Icon name="clock" /></span><strong>No hay horarios disponibles</strong><span>Prueba con otra fecha o selecciona otro médico.</span></div>}
        <div className="reschedule-modal-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => setReschedulingTarget(null)}>Volver</button>
          <button className="button primary" type="button" disabled={busy || rescheduleSlotsLoading || !selectedRescheduleSlotId} onClick={() => { const selected = visibleRescheduleSlots.find((slot) => slot.slotId === selectedRescheduleSlotId); if (selected) void reserve(selected); }}>{busy ? 'Guardando cambio…' : 'Confirmar reprogramación'}</button>
        </div>
      </section>
    </div>}
    {bookingTarget && isPatient && <div className="modal-backdrop booking-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setBookingTarget(null); }}>
      <section className="booking-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="booking-confirm-title" aria-describedby="booking-confirm-description">
        <button className="dialog-close" type="button" aria-label="Cerrar" disabled={busy} onClick={() => setBookingTarget(null)}>×</button>
        <span className="booking-confirm-icon"><Icon name="calendar" /></span>
        <p className="eyebrow">CONFIRMACIÓN RÁPIDA</p>
        <h2 id="booking-confirm-title">¿Confirmas el agendamiento?</h2>
        <p className="dialog-description" id="booking-confirm-description">Revisa los datos. Al confirmar, el horario quedará reservado para ti.</p>
        <div className="booking-confirm-details">
          <span>Fecha</span><strong>{dateLabel(bookingTarget.date)}</strong>
          <span>Hora</span><strong>{bookingTarget.startTime.slice(0, 5)} – {bookingTarget.endTime.slice(0, 5)}</strong>
          <span>Médico</span><strong>Dr(a). {bookingTarget.doctorFirstName} {bookingTarget.doctorLastName}</strong>
          {bookingTarget.room && <><span>Consultorio</span><strong>{bookingTarget.room}</strong></>}
        </div>
        <div className="booking-confirm-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={() => setBookingTarget(null)}>Volver</button>
          <button className="button primary" type="button" disabled={busy} onClick={() => { const slot = bookingTarget; setBookingTarget(null); void reserve(slot); }}>{busy ? 'Agendando…' : 'Confirmar cita'}</button>
        </div>
      </section>
    </div>}
    {profileOpen && isPatient && <div className="modal-backdrop profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setProfileOpen(false)}>×</button>
        <span className="profile-avatar"><Icon name="user" /></span><p className="eyebrow">MI CUENTA</p><h2 id="profile-title">Mi perfil</h2>
        <div className="profile-details"><span>Nombre</span><strong>{user.firstName} {user.lastName}</strong><span>Correo electrónico</span><strong>{user.email}</strong><span>Documento</span><strong>{user.documentType} {user.documentId}</strong><span>Tipo de cuenta</span><strong>Paciente SAVCM</strong></div>
        <button className="button primary full" onClick={() => setProfileOpen(false)}>Listo</button>
      </section>
    </div>}
    {cancellationTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCancellationTarget(null); }}>
      <section className={`cancel-modal ${user.role === 'DOCTOR' ? 'doctor-cancel-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description">
        <button className="dialog-close" type="button" aria-label="Cerrar" disabled={busy} onClick={() => setCancellationTarget(null)}>×</button>
        <span className="cancel-modal-icon" aria-hidden="true">×</span>
        <p className="eyebrow">GESTIÓN DE CITAS</p>
        <h2 id="cancel-title">Cancelar esta cita</h2>
        <p className="dialog-description" id="cancel-description">{user.role === 'DOCTOR' ? 'Escribe el motivo que recibirá el paciente por correo y verá en su historial. El horario quedará libre.' : 'Cuéntanos brevemente por qué necesitas cancelarla. El horario quedará libre para otro paciente.'}</p>
        <div className="cancel-appointment-summary">
          <span>Fecha y hora</span><strong>{dateLabel(cancellationTarget.date)} · {cancellationTarget.startTime.slice(0, 5)}</strong>
          <span>Médico</span><strong>Dr(a). {cancellationTarget.doctorFirstName} {cancellationTarget.doctorLastName}</strong>
          {user.role === 'DOCTOR' && <><span>Paciente</span><strong>{cancellationTarget.patientFirstName} {cancellationTarget.patientLastName}</strong></>}
        </div>
        <form className="cancel-form" onSubmit={(event) => { event.preventDefault(); void cancel(cancellationTarget, cancellationReason); }}>
          <label htmlFor="cancellation-reason">{user.role === 'DOCTOR' ? 'Mensaje para el paciente' : 'Motivo de cancelación'}</label>
          <textarea id="cancellation-reason" autoFocus required minLength={3} maxLength={500} rows={4} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder={user.role === 'DOCTOR' ? 'Ej.: el médico no podrá atender por una emergencia…' : 'Escribe el motivo aquí…'} />
          <small>{user.role === 'DOCTOR' ? 'Enviaremos este mensaje al correo registrado y quedará guardado en el historial.' : 'Este motivo quedará asociado al registro de la cita.'}</small>
          {cancellationError && <div className="notice error" role="alert">{cancellationError}</div>}
          <div className="modal-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={() => setCancellationTarget(null)}>Volver</button>
            <button className="button cancel-confirm" type="submit" disabled={busy || cancellationReason.trim().length < 3}>{busy ? 'Cancelando…' : user.role === 'DOCTOR' ? 'Cancelar y avisar al paciente' : 'Confirmar cancelación'}</button>
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

function AdminSidebar({ activePage, onNavigate }: { activePage: AdminPage; onNavigate: (page: AdminPage) => void }) {
  const items: Array<{ page: AdminPage; label: string; icon: 'home' | 'user' | 'clock' | 'calendar' | 'bolt' }> = [
    { page: 'overview', label: 'Resumen', icon: 'home' },
    { page: 'doctors', label: 'Médicos', icon: 'user' },
    { page: 'schedules', label: 'Crear horarios', icon: 'clock' },
    { page: 'agendas', label: 'Agendas', icon: 'calendar' },
    { page: 'patients', label: 'Pacientes', icon: 'user' },
    { page: 'appointments', label: 'Citas', icon: 'calendar' },
    { page: 'reports', label: 'Indicadores', icon: 'bolt' },
  ];
  return <aside className="admin-sidebar" aria-label="Navegación de administración">
    <div className="admin-sidebar-label">GESTIÓN</div>
    <nav>{items.map(({ page, label, icon }) => <button key={page} type="button" className={`admin-nav-link ${activePage === page ? 'active' : ''}`} aria-current={activePage === page ? 'page' : undefined} onClick={() => onNavigate(page)}><Icon name={icon} /><span>{label}</span>{activePage === page && <i aria-hidden="true" />}</button>)}</nav>
    <div className="admin-sidebar-foot"><span className="admin-sidebar-status"><i />Sistema activo</span><small>Administración SAVCM</small></div>
  </aside>;
}

function AdminTools({ activePage, appointments, doctors, onDoctorsChanged, onScheduleCreated, report, reportFrom, setReportFrom, reportTo, setReportTo, onGenerateReport, setMessage, setError }: { activePage: AdminPage; appointments: Appointment[]; doctors: Doctor[]; onDoctorsChanged: () => Promise<void>; onScheduleCreated: (date: string, doctorId: string) => void; report: Report | null; reportFrom: string; setReportFrom: (value: string) => void; reportTo: string; setReportTo: (value: string) => void; onGenerateReport: (event: FormEvent) => Promise<void>; setMessage: (value: string) => void; setError: (value: string) => void }) {
  const [schedule, setSchedule] = useState({ doctorId: '', date: today(), startTime: '08:00', endTime: '12:00', slotMinutes: 30, room: '' });
  const [doctor, setDoctor] = useState({ documentId: '', firstName: '', lastName: '', email: '', password: '', specialty: 'Medicina General', phone: '', room: '' });
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [roster, setRoster] = useState<RosterPatient[]>([]);
  const [rosterDocument, setRosterDocument] = useState('');
  const [patientCsvFile, setPatientCsvFile] = useState<File | null>(null);
  const [patientCsvResult, setPatientCsvResult] = useState<PatientCsvImportResult | null>(null);
  const patientCsvInput = useRef<HTMLInputElement | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [agendaFrom, setAgendaFrom] = useState(today());
  const [agendaTo, setAgendaTo] = useState(() => addDays(today(), 29));
  const [agendaDoctorId, setAgendaDoctorId] = useState('');
  const [adminAgenda, setAdminAgenda] = useState<AdminAgendaSlot[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const agendaRequestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const patientUsers = managedUsers.filter((item) => item.role === 'PATIENT');
  const doctorUsers = managedUsers.filter((item) => item.role === 'DOCTOR');
  const visiblePatientUsers = patientUsers.filter((patient) => {
    const query = patientSearch.trim().toLowerCase();
    return !query || `${patient.firstName} ${patient.lastName} ${patient.documentId} ${patient.email}`.toLowerCase().includes(query);
  });
  const activeAdminAgenda = adminAgenda.filter((slot) => slot.slotActive);
  const bookedAdminAgenda = activeAdminAgenda.filter((slot) => Boolean(slot.appointmentId));
  const freeAdminAgenda = activeAdminAgenda.length - bookedAdminAgenda.length;
  useEffect(() => {
    void Promise.all([api<ManagedUser[]>('/admin/users'), api<RosterPatient[]>('/admin/eps-roster')])
      .then(([users, patients]) => { setManagedUsers(users); setRoster(patients); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la administración.'));
  }, []);
  async function loadAdminAgenda(from = agendaFrom, to = agendaTo, doctorId = agendaDoctorId) {
    const requestId = ++agendaRequestId.current;
    if (!from || !to || from > to) {
      setAgendaLoading(false); setAdminAgenda([]); setError('El rango de fechas de la agenda no es válido.'); return;
    }
    setError('');
    setAgendaLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (doctorId) params.set('doctorId', doctorId);
      const result = await api<AdminAgendaSlot[]>(`/schedules/admin?${params.toString()}`);
      if (requestId === agendaRequestId.current) setAdminAgenda(result);
    } catch (cause) { if (requestId === agendaRequestId.current) setError(cause instanceof Error ? cause.message : 'No se pudo consultar las agendas.'); }
    finally { if (requestId === agendaRequestId.current) setAgendaLoading(false); }
  }
  useEffect(() => { void loadAdminAgenda(); }, [agendaFrom, agendaTo, agendaDoctorId]);
  async function createSchedule(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<unknown[]>('/schedules', { method: 'POST', body: JSON.stringify(schedule) });
      onScheduleCreated(schedule.date, schedule.doctorId);
      setAgendaFrom(schedule.date); setAgendaTo(schedule.date); setAgendaDoctorId(schedule.doctorId);
      await loadAdminAgenda(schedule.date, schedule.date, schedule.doctorId);
      setMessage(`Agenda creada con ${result.length} bloques disponibles.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la agenda.'); }
    finally { setBusy(false); }
  }
  async function createDoctor(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/doctors', { method: 'POST', body: JSON.stringify({ ...doctor, phone: doctor.phone.trim() || undefined, room: doctor.room.trim() || undefined }) });
      setDoctor({ documentId: '', firstName: '', lastName: '', email: '', password: '', specialty: 'Medicina General', phone: '', room: '' });
      setMessage('Médico registrado. Ya puedes configurar su agenda.'); await Promise.all([onDoctorsChanged(), api<ManagedUser[]>('/admin/users').then(setManagedUsers)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar el médico.'); }
    finally { setBusy(false); }
  }
  async function addRosterDocument(documentId: string) {
    setError(''); setMessage('');
    try {
      await api('/admin/eps-roster', { method: 'POST', body: JSON.stringify({ documentId }) });
      setRoster(await api<RosterPatient[]>('/admin/eps-roster')); setMessage('Cédula agregada al padrón activo.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el padrón.'); }
  }
  async function addRosterPatient(event: FormEvent) {
    event.preventDefault(); await addRosterDocument(rosterDocument); setRosterDocument('');
  }
  function downloadPatientCsvTemplate() {
    const csv = '\uFEFFcedula;nombres;apellidos;correo;telefono;fecha_nacimiento\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-pacientes-savcm.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importPatientCsv(event: FormEvent) {
    event.preventDefault();
    if (!patientCsvFile) { setError('Selecciona primero un archivo CSV.'); return; }
    setBusy(true); setError(''); setMessage(''); setPatientCsvResult(null);
    try {
      const formData = new FormData();
      formData.append('file', patientCsvFile);
      const result = await api<PatientCsvImportResult>('/admin/patients/import-csv', { method: 'POST', body: formData });
      setPatientCsvResult(result);
      const [updatedUsers, updatedRoster] = await Promise.all([api<ManagedUser[]>('/admin/users'), api<RosterPatient[]>('/admin/eps-roster')]);
      setManagedUsers(updatedUsers); setRoster(updatedRoster);
      setMessage(`Importación lista: ${result.created} pacientes creados${result.skipped ? ` y ${result.skipped} filas omitidas` : ''}.`);
      if (result.created) { setPatientCsvFile(null); if (patientCsvInput.current) patientCsvInput.current.value = ''; }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo importar el archivo.'); }
    finally { setBusy(false); }
  }
  async function changeRosterStatus(patient: RosterPatient) {
    try {
      await api(`/admin/eps-roster/${patient.documentId}/active`, { method: 'PATCH', body: JSON.stringify({ active: !patient.active }) });
      const [updatedRoster, updatedUsers] = await Promise.all([api<RosterPatient[]>('/admin/eps-roster'), api<ManagedUser[]>('/admin/users')]);
      setRoster(updatedRoster); setManagedUsers(updatedUsers); setMessage(patient.active ? 'Cédula desactivada y cuenta de paciente suspendida.' : 'Cédula habilitada para nuevos registros.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el padrón.'); }
  }
  async function changeUserStatus(item: ManagedUser) {
    try {
      await api(`/admin/users/${item.id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setManagedUsers(await api<ManagedUser[]>('/admin/users')); setMessage(item.active ? 'Cuenta desactivada.' : 'Cuenta activada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el usuario.'); }
  }
  async function changeScheduleStatus(slot: AdminAgendaSlot) {
    try {
      await api(`/schedules/${slot.slotId}/active`, { method: 'PATCH', body: JSON.stringify({ active: !slot.slotActive }) });
      await loadAdminAgenda();
      setMessage(slot.slotActive ? 'Horario cerrado para nuevas reservas.' : 'Horario habilitado para reservas.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el horario.'); }
  }
  if (activePage === 'appointments') return null;
  return <section className="admin-tools" id="admin">
    {activePage === 'overview' && <div className="admin-overview-cards"><article><span>MÉDICOS ACTIVOS</span><strong>{doctors.length}</strong><small>con acceso a agenda</small></article><article><span>PACIENTES</span><strong>{patientUsers.length}</strong><small>cuentas registradas</small></article><article><span>HORARIOS DISPONIBLES</span><strong>{freeAdminAgenda}</strong><small>en el rango consultado</small></article><article><span>CITAS REGISTRADAS</span><strong>{appointments.length}</strong><small>en total del sistema</small></article></div>}
    {activePage === 'schedules' && <div className="admin-page-body">
      <article className="card admin-card" id="admin-schedule-create"><div className="section-heading"><div><p className="eyebrow">CONFIGURACIÓN DE AGENDA</p><h2>Crear horarios</h2><p className="section-subtitle">Define el médico, la fecha y la duración de cada cita.</p></div><span className="icon-bubble">◷</span></div>
        {doctors.length === 0 ? <p className="muted">Registra un médico para empezar a abrir horarios.</p> : <form className="form-stack compact-form" onSubmit={createSchedule}>
          <label>Médico<select required value={schedule.doctorId} onChange={(e) => setSchedule({ ...schedule, doctorId: e.target.value })}><option value="">Selecciona médico</option>{doctors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Fecha<input required type="date" min={today()} value={schedule.date} onChange={(e) => setSchedule({ ...schedule, date: e.target.value })} /></label>
          <div className="form-row"><label>Desde<input required type="time" value={schedule.startTime} onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })} /></label><label>Hasta<input required type="time" value={schedule.endTime} onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })} /></label></div>
          <div className="form-row"><label>Duración<select value={schedule.slotMinutes} onChange={(e) => setSchedule({ ...schedule, slotMinutes: Number(e.target.value) })}><option value={20}>20 minutos</option><option value={30}>30 minutos</option><option value={40}>40 minutos</option><option value={60}>60 minutos</option></select></label><label>Consultorio<input value={schedule.room} onChange={(e) => setSchedule({ ...schedule, room: e.target.value })} placeholder="Ej. Consultorio 2" /></label></div>
          <button className="button primary" disabled={busy || !schedule.doctorId}>Generar bloques</button>
        </form>}
      </article>
    </div>}
    {activePage === 'doctors' && <div className="admin-page-body">
      <div className="admin-grid doctor-management-grid">
        <article className="card admin-card" id="admin-doctors"><div className="section-heading"><div><p className="eyebrow">TALENTO HUMANO</p><h2>Crear médico</h2><p className="section-subtitle">Registra una cuenta con acceso al panel médico.</p></div><span className="icon-bubble">✳</span></div>
          <form className="form-stack compact-form" onSubmit={createDoctor}>
            <label>Cédula<input required inputMode="numeric" value={doctor.documentId} onChange={(e) => setDoctor({ ...doctor, documentId: e.target.value })} /></label>
            <div className="form-row"><label>Nombres<input required value={doctor.firstName} onChange={(e) => setDoctor({ ...doctor, firstName: e.target.value })} /></label><label>Apellidos<input required value={doctor.lastName} onChange={(e) => setDoctor({ ...doctor, lastName: e.target.value })} /></label></div>
            <label>Correo<input required type="email" value={doctor.email} onChange={(e) => setDoctor({ ...doctor, email: e.target.value })} /></label>
            <div className="form-row"><label>Especialidad<input required minLength={3} maxLength={80} value={doctor.specialty} onChange={(e) => setDoctor({ ...doctor, specialty: e.target.value })} /></label><label>Teléfono<input type="tel" value={doctor.phone} onChange={(e) => setDoctor({ ...doctor, phone: e.target.value })} /></label></div>
            <div className="form-row"><label>Contraseña temporal<input required minLength={8} type="password" value={doctor.password} onChange={(e) => setDoctor({ ...doctor, password: e.target.value })} /></label><label>Consultorio base<input maxLength={30} value={doctor.room} onChange={(e) => setDoctor({ ...doctor, room: e.target.value })} /></label></div>
            <button className="button secondary" disabled={busy}>Guardar médico</button>
          </form>
        </article>
        <article className="card admin-card admin-doctor-card"><div className="section-heading"><div><p className="eyebrow">CUENTAS MÉDICAS</p><h2>Médicos registrados</h2></div><span className="icon-bubble"><Icon name="user" /></span></div>
          {doctorUsers.length === 0 ? <div className="admin-agenda-empty">Todavía no hay cuentas médicas.</div> : <div className="admin-doctor-list">{doctorUsers.map((item) => <div className="admin-doctor-row" key={item.id}><div><strong>Dr(a). {item.firstName} {item.lastName}</strong><small>{item.email} · Cédula {item.documentId}</small></div><span className={`admin-account-state ${item.active ? 'is-active' : 'is-inactive'}`}>{item.active ? 'Cuenta activa' : 'Cuenta suspendida'}</span><button type="button" onClick={() => void changeUserStatus(item)}>{item.active ? 'Suspender' : 'Activar'}</button></div>)}</div>}
        </article>
      </div>
    </div>}
    {activePage === 'agendas' && <div className="admin-page-body">
    <article className="card admin-agenda-card" id="admin-agenda-view">
      <div className="section-heading"><div><p className="eyebrow">05 · DISPONIBILIDAD MÉDICA</p><h2>Agendas y horarios</h2><p className="section-subtitle">Consulta los bloques, sus reservas y el paciente asignado.</p></div><button className="refresh-button" type="button" onClick={() => void loadAdminAgenda()} aria-label="Actualizar agendas"><Icon name="refresh" /></button></div>
      <div className="admin-agenda-filters"><label>Desde<input type="date" value={agendaFrom} onChange={(event) => setAgendaFrom(event.target.value)} /></label><label>Hasta<input type="date" value={agendaTo} onChange={(event) => setAgendaTo(event.target.value)} /></label><label>Médico<select value={agendaDoctorId} onChange={(event) => setAgendaDoctorId(event.target.value)}><option value="">Todos los médicos</option>{doctors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="admin-agenda-metrics"><span><strong>{activeAdminAgenda.length}</strong> horarios activos</span><span><strong>{bookedAdminAgenda.length}</strong> ocupados</span><span><strong>{freeAdminAgenda}</strong> disponibles</span><span><strong>{adminAgenda.length - activeAdminAgenda.length}</strong> cerrados</span></div>
      {agendaLoading ? <div className="admin-agenda-empty">Consultando agendas…</div> : adminAgenda.length === 0 ? <div className="admin-agenda-empty"><strong>No hay horarios en este rango</strong><span>Elige otras fechas o crea nuevos horarios para un médico.</span></div> : <div className="admin-agenda-list">{adminAgenda.map((slot) => <div className={`admin-agenda-row ${!slot.slotActive ? 'is-inactive' : ''}`} key={slot.slotId}>
        <div className="admin-agenda-date"><strong>{dateKey(slot.date).slice(8, 10)}</strong><span>{monthShort(slot.date)}</span></div>
        <div className="admin-agenda-details"><strong>Dr(a). {slot.doctorFirstName} {slot.doctorLastName}</strong><span>{slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}{slot.room ? ` · ${slot.room}` : ''}</span><small>{slot.specialty || 'Medicina General'}{!slot.doctorActive ? ' · Médico inactivo' : ''}</small></div>
        <div className="admin-agenda-booking">{slot.appointmentId ? <><span className="agenda-state booked">Ocupado</span><strong>{slot.patientFirstName} {slot.patientLastName}</strong><small>Cédula {slot.patientDocument}</small></> : <span className={`agenda-state ${slot.slotActive ? 'available' : 'closed'}`}>{slot.slotActive ? 'Disponible' : 'Cerrado'}</span>}</div>
        <button className="admin-agenda-action" type="button" disabled={Boolean(slot.appointmentId) || !slot.doctorActive} onClick={() => void changeScheduleStatus(slot)}>{slot.slotActive ? 'Cerrar' : 'Reabrir'}</button>
      </div>)}</div>}
    </article>
    </div>}
    {activePage === 'patients' && <div className="admin-page-body">
    <div className="admin-grid management-grid">
      <article className="card admin-card patient-import-card">
        <div className="section-heading"><div><p className="eyebrow">IMPORTACIÓN MASIVA</p><h2>Crear pacientes desde CSV</h2><p className="section-subtitle">Descarga la plantilla, agrega una fila por paciente y súbela para crear sus cuentas.</p></div><span className="icon-bubble" aria-hidden="true">⇩</span></div>
        <div className="patient-import-columns"><code>cedula · nombres · apellidos · correo · telefono · fecha_nacimiento</code><span>Usa fecha AAAA-MM-DD. Cada cuenta creada recibe por correo un enlace de un solo uso para establecer su propia contraseña. Se aceptan separadores coma o punto y coma, hasta 500 pacientes.</span></div>
        <form className="patient-import-form" onSubmit={(event) => void importPatientCsv(event)}>
          <button type="button" className="button secondary" onClick={downloadPatientCsvTemplate}>Descargar plantilla CSV</button>
          <label className="patient-csv-file">Archivo CSV<input ref={patientCsvInput} required type="file" accept=".csv,text/csv" onChange={(event) => { setPatientCsvFile(event.target.files?.[0] ?? null); setPatientCsvResult(null); }} /></label>
          <button className="button primary" disabled={busy || !patientCsvFile}>{busy ? 'Importando…' : 'Importar pacientes'}</button>
        </form>
        {patientCsvResult && <div className="patient-import-result" role="status"><strong>{patientCsvResult.created} creados · {patientCsvResult.skipped} omitidos de {patientCsvResult.totalRows} filas · {patientCsvResult.setupLinksSent} enlaces para crear contraseña enviados</strong>{patientCsvResult.setupLinkFailures.length > 0 && <p>No se enviaron los enlaces de las filas {patientCsvResult.setupLinkFailures.map((item) => item.row).join(', ')}. Indícales usar “¿Olvidaste tu contraseña?” para solicitar otro.</p>}{patientCsvResult.errors.length > 0 && <ul>{patientCsvResult.errors.map((item, index) => <li key={`${item.row}-${index}`}>Fila {item.row}: {item.message}</li>)}</ul>}</div>}
      </article>
      <article className="card admin-card" id="admin-roster"><div className="section-heading"><div><p className="eyebrow">06 · VALIDACIÓN EPS</p><h2>Padrón de cédulas</h2></div><span className="icon-bubble">⌕</span></div>
        <form className="roster-form" onSubmit={(event) => void addRosterPatient(event)}><label>Nueva cédula autorizada<input required inputMode="numeric" value={rosterDocument} onChange={(event) => setRosterDocument(event.target.value)} /></label><button className="button secondary">Agregar</button></form>
        <div className="management-list">{roster.map((patient) => <div className="management-row" key={patient.documentId}><span>{patient.documentId}</span><span className={patient.active ? 'active-label' : 'inactive-label'}>{patient.active ? 'Activa' : 'Inactiva'}</span><button onClick={() => void changeRosterStatus(patient)}>{patient.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
      </article>
      <article className="card admin-card admin-patient-card" id="admin-patients"><div className="section-heading"><div><p className="eyebrow">07 · ATENCIÓN AL PACIENTE</p><h2>Gestionar pacientes</h2><p className="section-subtitle">Activa o suspende el acceso a la cuenta y al padrón EPS.</p></div><span className="icon-bubble">◉</span></div>
        <label className="admin-search-label">Buscar paciente<input type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Nombre, cédula o correo" /></label>
        <div className="admin-patient-list">{visiblePatientUsers.length === 0 ? <div className="admin-agenda-empty">{patientUsers.length === 0 ? 'Todavía no hay cuentas de pacientes.' : 'No encontramos pacientes con esa búsqueda.'}</div> : visiblePatientUsers.map((patient) => {
          const patientRoster = roster.find((item) => item.documentId === patient.documentId);
          return <div className="admin-patient-row" key={patient.id}><div className="admin-patient-person"><strong>{patient.firstName} {patient.lastName}</strong><small>Cédula {patient.documentId} · {patient.email}</small></div><span className={`admin-account-state ${patient.active ? 'is-active' : 'is-inactive'}`}>Cuenta {patient.active ? 'activa' : 'suspendida'}</span><span className={`admin-account-state ${patientRoster?.active ? 'is-active' : 'is-inactive'}`}>EPS {patientRoster ? patientRoster.active ? 'activa' : 'inactiva' : 'sin registro'}</span><div className="admin-patient-actions"><button type="button" onClick={() => void changeUserStatus(patient)}>{patient.active ? 'Suspender cuenta' : 'Activar cuenta'}</button>{patientRoster ? <button type="button" onClick={() => void changeRosterStatus(patientRoster)}>{patientRoster.active ? 'Desactivar EPS' : 'Activar EPS'}</button> : <button type="button" onClick={() => void addRosterDocument(patient.documentId)}>Añadir al padrón</button>}</div></div>;
        })}</div>
      </article>
    </div>
    </div>}
    {activePage === 'reports' && <div className="admin-page-body">
    <article className="card report-card" id="admin-reports"><div className="section-heading"><div><p className="eyebrow">09 · INDICADORES</p><h2>Reporte administrativo</h2></div><span className="icon-bubble">↗</span></div>
      <form className="report-filter" onSubmit={(event) => void onGenerateReport(event)}><label>Desde<input type="date" required value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label><label>Hasta<input type="date" required value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label><button className="button primary">Generar reporte</button></form>
      {report ? <><div className="metric-grid"><Metric value={report.totals.total} label="Citas registradas" /><Metric value={`${report.agendaOccupancyPercent}%`} label="Ocupación de agenda" /><Metric value={`${report.absenceRatePercent}%`} label="Tasa de ausentismo" /><Metric value={`${report.cancellationAndReschedulePercent}%`} label="Cancelación / reprogramación" /></div><div className="report-status">{[['Agendadas', report.totals.scheduled], ['Canceladas', report.totals.cancelled], ['Reprogramadas', report.totals.rescheduled], ['Realizadas', report.totals.completed], ['No asistió', report.totals.noShow]].map(([label, value]) => <span key={label}>{label}<strong>{value}</strong></span>)}</div>
        {report.doctors.length > 0 && <div className="doctor-occupancy"><strong>Ocupación por médico</strong>{report.doctors.map((item) => <div className="occupancy-row" key={item.doctorId}><span>{item.doctor}</span><div className="progress"><i style={{ width: `${Math.min(item.occupancyPercent, 100)}%` }} /></div><b>{item.occupancyPercent}%</b><small>{item.reservedSlots}/{item.offeredSlots}</small></div>)}</div>}</> : <p className="muted report-placeholder">Selecciona un rango para consultar demanda, ausentismo y ocupación.</p>}
    </article>
    </div>}
  </section>;
}

function Metric({ value, label }: { value: string | number; label: string }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div>; }
function StatusPill({ status, cancellationSource, isPatient }: { status: string; cancellationSource?: Appointment['cancellationSource']; isPatient?: boolean }) {
  const labels: Record<string, string> = { SCHEDULED: 'Agendada', CANCELLED: 'Cancelada', RESCHEDULED: 'Reprogramada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió' };
  const cancellationLabels: Record<string, string> = { DOCTOR: 'Cancelada por el médico', PATIENT: 'Cancelada por ti', STAFF: 'Cancelada por SAVCM' };
  const cancellationLabel = isPatient && status === 'CANCELLED'
    ? (cancellationLabels[cancellationSource || ''] || labels[status])
    : labels[status] || status;
  return <span className={`status-pill status-${status.toLowerCase()}`}>{cancellationLabel}</span>;
}
function dateKey(value: string | null | undefined) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}
function appointmentTimePassed(appointment: Pick<Appointment, 'date' | 'endTime'>) {
  const date = parseLocalDate(appointment.date);
  if (!date) return false;
  const [hours, minutes] = appointment.endTime.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  date.setHours(hours, minutes, 0, 0);
  return date.getTime() <= Date.now();
}
function minutesUntilAppointment(appointment: Pick<Appointment, 'date' | 'startTime'>) {
  const date = dateKey(appointment.date);
  const time = appointment.startTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return Number.NEGATIVE_INFINITY;
  const [year, month, day] = date.split('-').map(Number);
  const hours = Number(time[1]); const minutes = Number(time[2]); const seconds = Number(time[3] || 0);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));
  if (normalizedDate.toISOString().slice(0, 10) !== date || hours > 23 || minutes > 59 || seconds > 59) return Number.NEGATIVE_INFINITY;
  const currentInstant = new Date();
  const nowParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(currentInstant);
  const now = Object.fromEntries(nowParts.map((part) => [part.type, part.value]));
  const currentWallClock = Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day), Number(now.hour), Number(now.minute), Number(now.second)) + currentInstant.getMilliseconds();
  const appointmentWallClock = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return (appointmentWallClock - currentWallClock) / 60_000;
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
