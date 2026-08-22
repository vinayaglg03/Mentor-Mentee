import nodemailer from 'nodemailer';
import config from '../config.js';
import logger from '../logger.js';

// One interface, three backings. Which one runs is config, not code, so
// moving from a console-only dev box to the college SMTP server or to Resend
// is an environment change.
//
//   console - writes the message to the log (the default, and what tests use)
//   smtp    - any SMTP server, via nodemailer
//   resend  - Resend's HTTP API, for hosts that block outbound SMTP
//
// Every driver exposes the same send({ to, subject, text, html }).

const consoleDriver = {
  name: 'console',
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject },
      'Email not sent: MAIL_DRIVER is "console"'
    );
    return { accepted: [message.to], driver: 'console' };
  },
};

const smtpDriver = () => {
  const transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    ...(config.mail.user
      ? { auth: { user: config.mail.user, pass: config.mail.password } }
      : {}),
  });

  return {
    name: 'smtp',
    async send(message) {
      const result = await transport.sendMail({ from: config.mail.from, ...message });
      return { accepted: result.accepted, driver: 'smtp' };
    },
  };
};

const resendDriver = () => ({
  name: 'resend',
  async send(message) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.mail.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend rejected the message: ${response.status} ${await response.text()}`);
    }

    return { accepted: [message.to], driver: 'resend' };
  },
});

const drivers = {
  console: () => consoleDriver,
  smtp: smtpDriver,
  resend: resendDriver,
};

let active = null;

export const mailer = () => {
  if (!active) {
    const factory = drivers[config.mail.driver] ?? drivers.console;
    active = factory();
  }
  return active;
};

// Used by tests to swap in a recording driver.
export const setMailer = (driver) => { active = driver; };
export const resetMailer = () => { active = null; };

export const sendMail = async (message) => {
  try {
    return await mailer().send(message);
  } catch (error) {
    // A digest that fails to send must not take the job down with it.
    logger.error({ err: error, to: message.to, subject: message.subject }, 'Email failed to send');
    return { accepted: [], error: error.message };
  }
};

// Every digest carries one, and it must work without signing in.
export const unsubscribeUrl = (token) => `${config.appUrl}/notifications/unsubscribe?token=${token}`;
