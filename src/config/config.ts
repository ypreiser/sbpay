import env from "./env.js";

export const config = {
  development: {
    logLevel: "debug",
    keepAlive: false,
  },
  production: {
    logLevel: "info",
    keepAlive: true,
  },
}[env.NODE_ENV];
