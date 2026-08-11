import serverless from "serverless-http";
import app from "../../src/app";

/**
 * Netlify entry point. netlify.toml routes /api/*, /auth/* and /webhooks/* here
 * with the original path preserved after the function name, e.g.
 *
 *   GET /api/session  ->  /.netlify/functions/api/api/session
 *
 * `basePath` strips the function prefix so Express sees "/api/session" and the
 * routes in src/app.ts match unchanged.
 */
export const handler = serverless(app, {
  basePath: "/.netlify/functions/api",
});
