import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getPreferences, setPreferences, unsubscribe } from '../controllers/notifications.js';
import { setPreferencesSchema, unsubscribeSchema } from '../schemas/notifications.js';

const router = express.Router();

// Unsubscribe is deliberately public: it is reached from a link in an email,
// and asking somebody to sign in before they can stop the email is how you
// end up in a spam folder.
router.post('/unsubscribe', validate(unsubscribeSchema), unsubscribe);

router.get('/preferences', authenticateToken, getPreferences);
router.put('/preferences', authenticateToken, validate(setPreferencesSchema), setPreferences);

export default router;
