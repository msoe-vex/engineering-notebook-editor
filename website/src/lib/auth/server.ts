import { betterAuth } from "better-auth";
import { jwt, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { metadataStoreAdapter } from "./metadataStoreAdapter";
import { getWebsiteMetadataStore } from "../cloud/httpMetadataStore";

export const auth = betterAuth({
  database: metadataStoreAdapter(getWebsiteMetadataStore()),
  secret: process.env.BETTER_AUTH_SECRET || "dev-better-auth-secret-key-min-32-chars-long",
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  onAPIError: {
    errorURL: "/",
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "dev_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "dev_github_client_secret",
      scope: ["user:email", "read:user"],
      mapProfileToUser: (profile) => {
        if (profile.email) {
          return {
            email: profile.email,
            emailVerified: true,
            needsEmailOnboarding: false,
          };
        }
        // Placeholder email when GitHub keeps all emails private; gated to onboarding UI
        return {
          email: `pending-${profile.id}@placeholder.local`,
          emailVerified: false,
          needsEmailOnboarding: true,
        };
      },
      enabled: true,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID || "dev_discord_client_id",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "dev_discord_client_secret",
      enabled: true,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "dev_google_client_id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dev_google_client_secret",
      enabled: true,
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID || "dev_linkedin_client_id",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "dev_linkedin_client_secret",
      enabled: true,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      needsEmailOnboarding: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
    changeEmail: {
      enabled: true,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      trustedProviders: ["google"],
    },
  },
  plugins: [
    jwt({
      jwt: {
        expirationTime: "7d",
      },
    }),
    twoFactor({
      issuer: "Engineering Notebook",
      otpOptions: {
        async sendOTP({ user, otp }) {
          // TODO: wire to production email transport when configured
          console.log(`[2FA OTP] ${user.email}: ${otp}`);
        },
      },
    }),
    passkey({
      rpID: typeof window !== "undefined" ? window.location.hostname : "localhost",
      rpName: "Engineering Notebook",
      origin: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    }),
  ],
});
