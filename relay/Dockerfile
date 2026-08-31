FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY relay/package*.json relay/
RUN npm install --prefix relay
COPY relay relay
RUN npm run build --prefix relay

FROM node:22-alpine
WORKDIR /app/relay
ENV NODE_ENV=production
COPY relay/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/relay/dist dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
