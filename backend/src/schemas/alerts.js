import { idParam, studentIdParam } from './common.js';

export const resolveAlertSchema = {
  params: idParam
};

export const studentAlertsSchema = {
  params: studentIdParam
};
