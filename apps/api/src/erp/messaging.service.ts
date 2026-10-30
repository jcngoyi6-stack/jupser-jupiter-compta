import { Injectable, Logger } from '@nestjs/common';

/**
 * Ports SmsProvider / MailProvider / WhatsApp (docs/02). Production : variables SMS_API_URL, MAIL_API_URL…
 * En l'absence de prestataire configuré, les messages sont journalisés (mode simulation).
 */
@Injectable()
export class MessagingService {
  private readonly log = new Logger('Messagerie');
  readonly sent: { channel: string; to: string; text: string }[] = [];

  async send(channel: 'SMS' | 'WHATSAPP' | 'EMAIL', to: string, text: string, subject = 'Jupiter Compta'): Promise<'ENVOYE' | 'ECHEC'> {
    const url = channel === 'EMAIL' ? process.env.MAIL_API_URL : channel === 'SMS' ? process.env.SMS_API_URL : process.env.WHATSAPP_API_URL;
    const token = channel === 'EMAIL' ? process.env.MAIL_API_TOKEN : channel === 'SMS' ? process.env.SMS_API_TOKEN : process.env.WHATSAPP_API_TOKEN;
    if (!url) {
      this.sent.push({ channel, to, text });
      this.log.log(`[simulation ${channel}] → ${to} : ${text.slice(0, 80)}`);
      return 'ENVOYE';
    }
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ to, text, subject }) });
      return res.ok ? 'ENVOYE' : 'ECHEC';
    } catch {
      return 'ECHEC';
    }
  }
}
