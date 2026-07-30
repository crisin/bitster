FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx expo export --platform web

FROM node:22-alpine

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/feedback.js ./feedback.js
COPY --from=build /app/package.json ./package.json
# ws is the server's only runtime dependency (it has none of its own)
COPY --from=build /app/node_modules/ws ./node_modules/ws

EXPOSE 8080
ENV PORT=8080

CMD ["node", "server.js"]
