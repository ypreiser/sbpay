import env from "./env.ts";

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
