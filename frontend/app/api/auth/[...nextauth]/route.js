import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXT_PUBLIC_SECRET,
  pages: {
    signOut: "/",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Handle redirection after sign-in
      if (url === baseUrl || url === `${baseUrl}/api/auth/callback/google`) {
        return baseUrl + "/map"; // Redirect to /map after login
      }

      // Handle redirection after sign-out or other cases
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
    async session({ session, token, user }) {
      // Attach additional properties to the session object
      session.user.id = token.sub;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
