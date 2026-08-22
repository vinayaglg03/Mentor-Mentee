import prisma from '../prismaClient.js';
import { NotFoundError } from '../lib/access.js';
import { ensureUnsubscribeToken } from '../lib/digests.js';
import config from '../config.js';

export const getPreferences = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, digestFrequency: true, lastDigestAt: true, unsubscribeToken: true },
    });

    if (!user) throw new NotFoundError('User not found.');

    const token = await ensureUnsubscribeToken(user);

    res.json({
      digestFrequency: user.digestFrequency,
      lastDigestAt: user.lastDigestAt,
      unsubscribeUrl: `${config.appUrl}/notifications/unsubscribe?token=${token}`,
      escalateAfterDays: config.notifications.escalateAfterDays,
      inactivityDays: config.notifications.inactivityDays,
    });
  } catch (error) {
    next(error);
  }
};

export const setPreferences = async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { digestFrequency: req.body.digestFrequency },
      select: { digestFrequency: true },
    });

    res.json({ message: 'Notification preference saved', ...user });
  } catch (error) {
    next(error);
  }
};

// Reached from the link in an email, so it cannot require a signed-in
// session. The token is the only thing it accepts, and it only ever turns
// notifications down.
export const unsubscribe = async (req, res, next) => {
  try {
    const { token, digestFrequency = 'OFF' } = req.body;

    const user = await prisma.user.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'That link is no longer valid. Change the setting from your account instead.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { digestFrequency },
    });

    res.json({
      message: digestFrequency === 'OFF'
        ? 'You will not receive any more AMIS digests.'
        : `Your digest is now ${digestFrequency.toLowerCase()}.`,
      email: user.email,
      digestFrequency,
    });
  } catch (error) {
    next(error);
  }
};
