import serverless from "serverless-http";
import { initializeSessionSecret } from "../../src/auth";
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

let initialized = false;

const httpHandler = serverless(app, {
  basePath: "/.netlify/functions/api",
});

export const handler = async (event: any, context: any) => {
  if (!initialized) {
    await initializeSessionSecret();
    initialized = true;
  }
  return httpHandler(event, context);
};
