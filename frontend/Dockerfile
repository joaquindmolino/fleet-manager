FROM node:20.18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20.18-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
