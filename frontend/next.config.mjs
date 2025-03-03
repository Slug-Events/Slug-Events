export default async () => {
  const fetch = (await import("node-fetch")).default;
  
  // Fetch the environment variables from Firebase
  const res = await fetch("https://us-central1-slug-events-448506.cloudfunctions.net/getEnv");
  const firebaseEnv = await res.json();

  return {
    reactStrictMode: true,
    env: {
      NEXT_PUBLIC_BACKEND_URL: firebaseEnv.NEXT_PUBLIC_BACKEND_URL,
      NEXTAUTH_SECRET: firebaseEnv.NEXTAUTH_SECRET,
      GOOGLE_CLIENT_ID: firebaseEnv.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: firebaseEnv.GOOGLE_CLIENT_SECRET,
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: firebaseEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      NEXTAUTH_URL: firebaseEnv.NEXTAUTH_URL
    },
  };
};
