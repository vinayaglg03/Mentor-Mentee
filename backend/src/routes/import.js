import express from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getTemplate, preview, commit } from '../controllers/import.js';
import { importTypeParamSchema, commitImportSchema } from '../schemas/import.js';

const router = express.Router();

// Files are held in memory only: they are parsed, stored as JSON rows and
// discarded, so nothing untrusted ever touches the filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.use(authenticateToken, requireRole(['MENTOR', 'ADMIN']));

router.get('/:type/template', validate(importTypeParamSchema), getTemplate);
router.post('/:type/preview', validate(importTypeParamSchema), upload.single('file'), preview);
router.post('/:type/commit', validate(commitImportSchema), commit);

export default router;
