/**
 * Input sanitization and ReDoS prevention utilities
 */

/**
 * Recursively strips keys starting with '$' or containing '.' from objects.
 * Prevents NoSQL Operator Injection (e.g. { "$gt": "" }).
 */
export const cleanObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      cleanObject(obj[i]);
    }
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      cleanObject(obj[key]);
    }
  }
  return obj;
};

/**
 * Express middleware to sanitize body, query, and params against NoSQL injection.
 */
export const sanitizeInputs = (req, res, next) => {
  if (req.body) cleanObject(req.body);
  if (req.query) cleanObject(req.query);
  if (req.params) cleanObject(req.params);
  next();
};

/**
 * Escapes regex special characters to prevent Regular Expression Denial of Service (ReDoS)
 * and syntax crashes when constructing RegExp from user input.
 */
export const escapeRegex = (string = '') => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export default {
  cleanObject,
  sanitizeInputs,
  escapeRegex,
};
