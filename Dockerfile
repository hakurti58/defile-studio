FROM node:20-alpine
WORKDIR /app
COPY server.js widget.html package.json ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
