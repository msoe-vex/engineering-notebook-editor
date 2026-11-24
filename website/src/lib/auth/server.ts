import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { metadataStoreAdapter } from "./metadataStoreAdapter";
import { getWebsiteMetadataStore } from "../cloud/httpMetadataStore";

export const auth = betterAuth({
  database: metadataStoreAdapter(getWebsiteMetadataStore()),
  secret: process.env.BETTER_AUTH_SECRET || "dev-better-auth-secret-key-min-32-chars-long",
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "dev_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "dev_github_client_secret",
      scope: ["user:email", "read:user"],
      mapProfileToUser: (profile) => {
        // Fallback email if GitHub account keeps all emails private / hidden
        const email = profile.email || `${profile.login}@users.noreply.github.com`;
        return {
          email,
          emailVerified: true,
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
    changeEmail: {
      enabled: true,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
      trustedProviders: ["github", "discord", "google", "linkedin"],
    },
  },
  plugins: [
    jwt({
      jwt: {
        expirationTime: "7d",
      },
    }),
  ],
});
