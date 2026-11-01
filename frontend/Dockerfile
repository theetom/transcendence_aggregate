FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
