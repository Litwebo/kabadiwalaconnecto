export interface SmsMessage {
  to: string;
  body: string;
  templateKey?: string;
}

export interface SmsProvider {
  name: string;
  send(message: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string }>;
}

export class ConsoleSmsProvider implements SmsProvider {
  name = 'console';

  async send(message: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    const masked = message.to.replace(/(\+?\d{2,4})\d+(\d{4})/, '$1****$2');
    console.info(`[SMS:${this.name}] To=${masked} | ${message.body}`);
    return { ok: true, providerMessageId: `console_${Date.now()}` };
  }
}

export class Msg91SmsProvider implements SmsProvider {
  name = 'msg91';
  private authKey: string;
  private templateId: string;

  constructor(authKey: string, templateId: string) {
    this.authKey = authKey;
    this.templateId = templateId;
  }

  async send(message: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    if (!this.authKey || !this.templateId) {
      throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID must be configured');
    }
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: this.authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: this.templateId,
        recipients: [{ mobiles: message.to.replace(/^\+/, ''), body: message.body }],
      }),
    });
    if (!res.ok) {
      throw new Error(`MSG91 delivery failed with status ${res.status}`);
    }
    const data = (await res.json()) as { request_id?: string };
    return { ok: true, providerMessageId: data.request_id };
  }
}

export class TwilioSmsProvider implements SmsProvider {
  name = 'twilio';
  private sid: string;
  private token: string;
  private from: string;

  constructor(sid: string, token: string, from: string) {
    this.sid = sid;
    this.token = token;
    this.from = from;
  }

  async send(message: SmsMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    if (!this.sid || !this.token || !this.from) {
      throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required');
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`;
    const body = new URLSearchParams({ To: message.to, From: this.from, Body: message.body });
    const auth = Buffer.from(`${this.sid}:${this.token}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Twilio delivery failed with status ${res.status}`);
    }
    const data = (await res.json()) as { sid?: string };
    return { ok: true, providerMessageId: data.sid };
  }
}

export function getSmsProvider(): SmsProvider {
  const mode = (process.env.SMS_PROVIDER || 'console').toLowerCase();
  if (mode === 'msg91' && process.env.MSG91_AUTH_KEY) {
    return new Msg91SmsProvider(process.env.MSG91_AUTH_KEY, process.env.MSG91_TEMPLATE_ID || '');
  }
  if (mode === 'twilio' && process.env.TWILIO_ACCOUNT_SID) {
    return new TwilioSmsProvider(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN || '',
      process.env.TWILIO_FROM_NUMBER || ''
    );
  }
  return new ConsoleSmsProvider();
}
