# mcp — Node MCP server (stdio). Built for parity; usually spawned by an MCP
# client rather than run as a long-lived service, so it's NOT in the root compose.
#   docker build -t mcp ./mcp
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "start"]
