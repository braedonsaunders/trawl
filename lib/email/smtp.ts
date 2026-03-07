import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { getConfig } from '@/lib/config';

export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  cc?: string;
  messageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
}

/**
 * Create a nodemailer transporter from app config.
 */
function createTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  const config = getConfig();

  if (!config.smtp.user || !config.smtp.pass) {
    throw new Error(
      "SMTP credentials are not configured. Update the SQLite-backed SMTP settings and retry."
    );
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

/**
 * Send an email via SMTP.
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const config = getConfig();
  const transporter = createTransporter();

  const fromAddress = config.smtp.fromName
    ? `"${config.smtp.fromName}" <${config.smtp.user}>`
    : config.smtp.user;

  const toAddress = options.toName
    ? `"${options.toName}" <${options.to}>`
    : options.to;

  const mailOptions: Mail.Options = {
    from: fromAddress,
    to: toAddress,
    subject: options.subject,
    html: options.bodyHtml,
    text: options.bodyText,
  };

  if (options.cc) {
    mailOptions.cc = options.cc;
  }

  if (options.messageId) {
    mailOptions.messageId = options.messageId;
  }

  try {
    const info = await transporter.sendMail(mailOptions);

    return {
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted)
        ? info.accepted.map(String)
        : [],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown SMTP error';
    throw new Error(`Failed to send email to ${options.to}: ${message}`);
  } finally {
    transporter.close();
  }
}
