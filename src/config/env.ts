import { z } from "zod";
import { config } from "dotenv";

// Load environment variables from .env file
config();

const envSchema = z.object({
  YAAD_MASOF: z.string(),
  YAAD_KEY: z.string(),
  YAAD_PassP: z.string(),
  SBPAY_API_KEY: z.string(),
  SBPAY_SECRET: z.string(),
  SBPAY_MERCHANT: z.string(),
  SBPAY_API_URL: z.string(),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.string().default("3000"),
});

const env = envSchema.parse(process.env);
export default env;
