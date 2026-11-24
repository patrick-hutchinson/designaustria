FROM node:24

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Set after the install and build steps, which need the dev dependencies.
ENV NODE_ENV=production
# Default: the Vendure server (API + dashboard). The worker service overrides this
# with the start command `node ./dist/index-worker.js`.
CMD ["node", "./dist/index.js"]
