export const PASSWORD_RESET_EMAIL = Symbol('PASSWORD_RESET_EMAIL');

export interface PasswordResetEmailPort {
  assertReady(): void;
  sendPasswordReset(input: { email: string; firstName: string; resetUrl: string }): Promise<void>;
}
