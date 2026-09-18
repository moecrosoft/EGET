FROM node:20-slim

WORKDIR /app

# Copy all repository files into the container
COPY . .

RUN cd backend && npm install --production

# Expose port 8080 (Cloud Run's default port)
EXPOSE 8080

# Change working directory to backend and start the application
WORKDIR /app/backend
CMD ["node", "server.js"]