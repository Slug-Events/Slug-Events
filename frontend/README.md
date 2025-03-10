This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Deploy env vars on Google Cloud

1. After new branch has been merged to main navigate to google cloud console
2. Then go to the `Cloud Run` section
3. Click on slug-events-next-app
4. Click on edit and deploy new revision
5. Click on `variables and secrets`
6. Set the env variables shown below
7. Click `Serve this revision immediately`
8. Click deploy

### Environment variables

* `NEXTAUTH_SECRET` = input anything

### Secrets exposed as environment variables

* `GOOGLE_CLIENT_ID` = latest version of `CLIENT_ID` secret
* `GOOGLE_CLIENT_SECRET` = lastest version of `CLIENT_SECRET` secret