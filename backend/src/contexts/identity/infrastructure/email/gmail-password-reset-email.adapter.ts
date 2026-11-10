import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { PasswordResetEmailPort } from '../../application/password-reset-email.port';

@Injectable()
export class GmailPasswordResetEmailAdapter implements PasswordResetEmailPort {
  private readonly logger = new Logger(GmailPasswordResetEmailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  assertReady() {
    const configured = Boolean(this.config.get<string>('GMAIL_USER') && this.config.get<string>('GMAIL_APP_PASSWORD'));
    if (process.env.NODE_ENV === 'production' && !configured) {
      throw new ServiceUnavailableException('La recuperación de contraseña por correo no está configurada.');
    }
  }

  async sendPasswordReset(input: { email: string; firstName: string; resetUrl: string }) {
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const appPassword = this.config.get<string>('GMAIL_APP_PASSWORD');
    if (!gmailUser || !appPassword) {
      this.logger.warn(`Gmail no está configurado; enlace local de recuperación: ${input.resetUrl}`);
      return false;
    }

    const greetingName = this.escapeHtml(input.firstName);
    const safeUrl = this.escapeHtml(input.resetUrl);
    const transporter = createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: appPassword.replace(/\s/g, '') },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    await transporter.sendMail({
      from: { name: 'SAVCM', address: gmailUser },
      to: input.email,
      subject: 'Crea o cambia tu contraseña de SAVCM',
      text: `Hola ${input.firstName}, usa este enlace para establecer o cambiar la contraseña de tu cuenta SAVCM. El enlace vence en 30 minutos y solo se puede usar una vez: ${input.resetUrl}. Si no solicitaste el enlace, puedes ignorar este correo.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#203c33"><h1 style="color:#126b58">Establece tu contraseña</h1><p>Hola ${greetingName}, usa este enlace para crear o cambiar la contraseña de tu cuenta SAVCM.</p><p><a href="${safeUrl}" style="display:inline-block;background:#126b58;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none">Crear contraseña</a></p><p>El enlace vence en 30 minutos y solo se puede usar una vez.</p><p>Si no solicitaste este enlace, puedes ignorar este correo.</p></div>`,
    });
    return true;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
  }
}
