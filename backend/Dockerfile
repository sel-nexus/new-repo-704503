FROM node:24.4.1-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-bin-links
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-bin-links

FROM node:24.4.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_URL=file:/app/data/starter.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
