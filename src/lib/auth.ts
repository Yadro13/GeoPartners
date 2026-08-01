import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "./email";
import { createRegistrationRequest } from "./registration";
import { errorFields, serverLog } from "./server-log";
import { emailMessages } from "@/i18n/email-messages";
import { getRequestLocale, normalizeAppLocale } from "@/i18n/server-locale";

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export const auth = betterAuth({
  appName: "GeoPartners",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? (isProductionBuild ? "http://localhost:3000" : undefined),
  secret: process.env.BETTER_AUTH_SECRET ?? (isProductionBuild ? "build-only-secret-not-used-at-runtime" : undefined),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [process.env.APP_URL ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      const locale = normalizeAppLocale((user as { locale?: unknown }).locale ?? await getRequestLocale());
      void sendEmail({
        to: user.email,
        ...emailMessages(locale).passwordReset(url),
      }).catch((error) => serverLog("error", "auth.password_reset.delivery_failed", errorFields(error)));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const locale = normalizeAppLocale((user as { locale?: unknown }).locale ?? await getRequestLocale());
        await sendEmail({
          to: user.email,
          ...emailMessages(locale).verification(url),
        });
        serverLog("info", "auth.email_verification.sent");
      } catch (error) {
        serverLog("error", "auth.email_verification.delivery_failed", errorFields(error));
        throw error;
      }
    },
    afterEmailVerification: async (verifiedUser) => {
      await createRegistrationRequest(verifiedUser.id, "password");
    },
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          mapProfileToUser: (profile) => {
            if (adminEmail && profile.email?.trim().toLowerCase() === adminEmail) {
              serverLog("warn", "auth.google.admin_blocked");
              throw new APIError("FORBIDDEN", {
                message: "Адміністратор входить лише за допомогою email і пароля.",
              });
            }
            return {};
          },
        },
      }
    : {},
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  user: {
    changeEmail: { enabled: false },
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
      accessLevel: { type: "string", defaultValue: "read", input: false },
      approvalStatus: { type: "string", defaultValue: "pending", input: false },
      registrationMethod: { type: "string", defaultValue: "password", input: false },
      reviewComment: { type: "string", required: false, input: false },
      reviewedAt: { type: "date", required: false, input: false },
      reviewedBy: { type: "string", required: false, input: false },
      locale: { type: "string", defaultValue: "uk", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const isAdmin = Boolean(adminEmail && newUser.email.toLowerCase() === adminEmail);
          const locale = await getRequestLocale();
          return {
            data: {
              ...newUser,
              role: isAdmin ? "admin" : "user",
              accessLevel: isAdmin ? "edit" : "read",
              approvalStatus: isAdmin ? "approved" : "pending",
              locale,
            },
          };
        },
        after: async (createdUser) => {
          serverLog("info", "auth.user.created", {
            role: createdUser.email.toLowerCase() === adminEmail ? "admin" : "user",
            verifiedAtCreation: createdUser.emailVerified,
          });
          if (createdUser.emailVerified && createdUser.email.toLowerCase() !== adminEmail) {
            await createRegistrationRequest(createdUser.id, "google");
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
