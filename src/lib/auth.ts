import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "./email";
import { createRegistrationRequest } from "./registration";

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
      void sendEmail({
        to: user.email,
        subject: "Відновлення пароля GeoPartners",
        text: `Щоб встановити новий пароль, відкрийте посилання: ${url}`,
        html: `<p>Щоб встановити новий пароль GeoPartners, відкрийте посилання:</p><p><a href="${url}">Встановити новий пароль</a></p>`,
      }).catch((error) => console.error("Password reset email delivery failed.", error));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Підтвердження email у GeoPartners",
        text: `Підтвердіть адресу email за посиланням: ${url}`,
        html: `<p>Підтвердіть адресу email для реєстрації у GeoPartners.</p><p><a href="${url}">Підтвердити email</a></p><p>Посилання дійсне протягом однієї години.</p>`,
      });
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
      disableImplicitLinking: true,
    },
  },
  user: {
    changeEmail: { enabled: false },
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
      approvalStatus: { type: "string", defaultValue: "pending", input: false },
      registrationMethod: { type: "string", defaultValue: "password", input: false },
      reviewComment: { type: "string", required: false, input: false },
      reviewedAt: { type: "date", required: false, input: false },
      reviewedBy: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const isAdmin = Boolean(adminEmail && newUser.email.toLowerCase() === adminEmail);
          return {
            data: {
              ...newUser,
              role: isAdmin ? "admin" : "user",
              approvalStatus: isAdmin ? "approved" : "pending",
            },
          };
        },
        after: async (createdUser) => {
          if (createdUser.emailVerified && createdUser.email.toLowerCase() !== adminEmail) {
            await createRegistrationRequest(createdUser.id, "google");
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
