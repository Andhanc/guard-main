FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Установка зависимостей (включая dev-зависимости, нужные для сборки)
COPY package.json package-lock.json* ./
RUN npm install


FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV NODE_ENV=production

# Копируем node_modules, затем исходники
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Сборка Next.js приложения
RUN npm run build

# После сборки чистим dev-зависимости, чтобы рантайм-образ был легче
RUN npm prune --omit=dev


FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Создаем директорию для данных (файлы и база документов)
RUN mkdir -p /app/data/uploads

# Копируем только то, что нужно для запуска
COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Директория с файлами/БД будет монтироваться как volume
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["npm", "run", "start"]

