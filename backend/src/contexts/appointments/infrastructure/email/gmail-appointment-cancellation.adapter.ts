import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { AppointmentCancellationNotifier } from '../../application/appointment-cancellation-notifier.port';

@Injectable()
export class GmailAppointmentCancellationAdapter implements AppointmentCancellationNotifier {
  private readonly logger = new Logger(GmailAppointmentCancellationAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendAppointmentCancellation(input: Parameters<AppointmentCancellationNotifier['sendAppointmentCancellation']>[0]) {
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const appPassword = this.config.get<string>('GMAIL_APP_PASSWORD');
    if (!gmailUser || !appPassword) {
      this.logger.warn('Gmail no está configurado; el motivo de cancelación se podrá consultar en el historial del paciente.');
      return false;
    }

    const transporter = createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: appPassword.replace(/\s/g, '') },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    const firstName = this.escapeHtml(input.firstName);
    const doctorName = this.escapeHtml(input.doctorName);
    const reason = this.escapeHtml(input.reason);
    const date = this.formatDate(input.date);
    const time = input.startTime.slice(0, 5);

    await transporter.sendMail({
      from: { name: 'SAVCM · Citas Médicas', address: gmailUser },
      to: input.email,
      subject: 'Actualización importante sobre tu cita médica',
      text: `Hola ${input.firstName}, ${input.doctorName} canceló tu cita del ${date} a las ${time}. Motivo: ${input.reason}. Puedes consultar tus citas en el portal SAVCM.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#17294a"><div style="border-radius:18px;background:#eef5ff;padding:24px"><p style="margin:0 0 10px;color:#1686e8;font-size:12px;font-weight:bold;letter-spacing:2px">SAVCM · CITAS MÉDICAS</p><h1 style="margin:0 0 14px;font-size:24px">Actualización de tu cita</h1><p>Hola ${firstName}, el equipo médico canceló esta cita:</p><p style="padding:14px;border:1px solid #dce7f4;border-radius:12px;background:#fff"><strong>${date} · ${time}</strong><br>${doctorName}</p><p><strong>Motivo informado por el médico</strong></p><p style="padding:14px;border-left:3px solid #278fe5;background:#fff;border-radius:4px 10px 10px 4px">${reason}</p><p style="color:#667993;font-size:13px">El horario ya está disponible para otros pacientes. Puedes consultar tus citas y buscar otro horario desde el portal SAVCM.</p></div></div>`,
    });
    return true;
  }

  private formatDate(value: string) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
  }
}
