FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN mkdir -p uploads
EXPOSE 5000
CMD ["npm", "start"]
