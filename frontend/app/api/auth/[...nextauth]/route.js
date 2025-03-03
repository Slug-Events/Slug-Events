import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  pages: {
    signOut: "/",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Ensure valid redirect URL
      const validRedirectUrls = [
        baseUrl,
        `${baseUrl}/api/auth/callback/google`
      ];

      return validRedirectUrls.includes(url) ? `${baseUrl}/map` : (url.startsWith(baseUrl) ? url : baseUrl);
    },
    async session({ session, token }) {
      // Ensure user ID is properly assigned
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
