export const APPOINTMENT_CANCELLATION_NOTIFIER = Symbol('APPOINTMENT_CANCELLATION_NOTIFIER');

export interface AppointmentCancellationNotifier {
  sendAppointmentCancellation(input: {
    email: string;
    firstName: string;
    date: string;
    startTime: string;
    doctorName: string;
    reason: string;
  }): Promise<boolean>;
}
