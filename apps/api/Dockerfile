# ---- base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM deps AS builder
COPY . .
# O prune do Nx limpa o desnecessário e gera o output em apps/api/dist
RUN pnpm nx run api:prune

# ---- runner ----
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
WORKDIR /app

# Copia apenas o resultado do build (código + package.json isolado)
# Nota: Se o seu Nx salva em dist/apps/api, ajuste o caminho abaixo
COPY --from=builder /app/apps/api/dist ./

# Instala as dependências de produção dentro do container final
ENV CI=true
RUN pnpm install --prod --frozen-lockfile --config.node-linker=hoisted

# Garante permissões corretas para o usuário node
RUN chown -R node:node /app

USER node
EXPOSE 3000
ENV PORT=3000

# O Nx geralmente gera o arquivo como main.js
CMD ["node", "main.js"]
