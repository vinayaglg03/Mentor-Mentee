import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getPreferences, updatePreferences, listDepartmentOptions,
  getInstitution, updateInstitution,
} from '../controllers/preferences.js';
import { updatePreferencesSchema, updateInstitutionSchema } from '../schemas/preferences.js';

const router = express.Router();

router.use(authenticateToken);

// Personal settings. Both of these are scoped to req.user.id inside the
// controller and neither takes a user id from the request, so there is no
// route by which one person reads or writes another's.
router.get('/', getPreferences);
router.put('/', validate(updatePreferencesSchema), updatePreferences);

// The departments this person may choose as their default.
router.get('/departments', listDepartmentOptions);

// Institution settings are one shared row, kept apart from personal ones on
// purpose. Readable by anybody signed in - the app shows the college name and
// the thresholds it is applying - and writable only by a head of department
// or above, which updateInstitution enforces through the permission layer.
router.get('/institution', getInstitution);
router.put('/institution', validate(updateInstitutionSchema), updateInstitution);

export default router;
