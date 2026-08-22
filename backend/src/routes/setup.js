import express from 'express';
import { authenticateToken, requireRoleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  setupStatus, saveInstitution, saveSetupState, completeSetup, assignMentors, assignToMentor,
} from '../controllers/setup.js';
import {
  saveInstitutionSchema, setupStateSchema, assignMentorsSchema, assignToMentorSchema,
} from '../schemas/setup.js';

const router = express.Router();

router.use(authenticateToken, requireRoleAtLeast('COORDINATOR'));

router.get('/status', setupStatus);
router.put('/institution', validate(saveInstitutionSchema), saveInstitution);
router.put('/state', validate(setupStateSchema), saveSetupState);
router.post('/complete', completeSetup);

router.post('/assign-mentors', validate(assignMentorsSchema), assignMentors);
router.post('/assign-to-mentor', validate(assignToMentorSchema), assignToMentor);

export default router;
