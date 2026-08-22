import config from '../config.js';
import logger from '../logger.js';
import { sendMail } from '../lib/mailer.js';

// Faculty who hit a bug with nowhere to report it stop using the tool and
// never say why. This is the nowhere-to-report fix: it captures what a
// developer actually needs and sends it on.
export const reportProblem = async (req, res, next) => {
  try {
    const { message, route, requestId, userAgent, viewport, appVersion } = req.body;

    const report = {
      reportedBy: { id: req.user.id, email: req.user.email, role: req.user.role },
      message,
      route,
      requestId: requestId || req.id,
      userAgent: userAgent || req.headers['user-agent'],
      viewport,
      appVersion,
      at: new Date().toISOString(),
    };

    // Logged whether or not email is configured, so nothing is lost on a
    // deployment that has not set SUPPORT_EMAIL yet.
    logger.warn({ report }, 'Problem reported from the app');

    if (config.support.email) {
      await sendMail({
        to: config.support.email,
        subject: `AMIS problem report from ${req.user.email}`,
        text: [
          message,
          '',
          '---',
          `Reported by: ${req.user.email} (${req.user.role})`,
          `Page: ${report.route}`,
          `Request reference: ${report.requestId}`,
          `Browser: ${report.userAgent}`,
          report.viewport ? `Screen: ${report.viewport}` : null,
          report.appVersion ? `Version: ${report.appVersion}` : null,
          `Time: ${report.at}`,
        ].filter(Boolean).join('\n'),
      });
    }

    res.json({
      message: config.support.email
        ? 'Thank you. Your report has been sent.'
        : 'Thank you. Your report has been recorded in the server log.',
      requestId: report.requestId,
      emailed: Boolean(config.support.email),
    });
  } catch (error) {
    next(error);
  }
};
