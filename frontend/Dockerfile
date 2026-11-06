FROM node:24.4.1-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-bin-links
COPY . .
ARG VITE_API_BASE_URL=/
ARG VITE_HEALTH_TIMEOUT_MS=5000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_HEALTH_TIMEOUT_MS=$VITE_HEALTH_TIMEOUT_MS
RUN npm run build

FROM nginx:1.28.0-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
