// Validates req.body / req.params / req.query against a zod schema.
// Parsed (and coerced) body values replace req.body so handlers see clean
// data. ZodErrors are handed to the central error handler, which turns them
// into a 400 with a field-level error list.
export const validate = (schema) => (req, res, next) => {
  try {
    if (schema.params) schema.params.parse(req.params);
    if (schema.query) schema.query.parse(req.query);
    if (schema.body) req.body = schema.body.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
