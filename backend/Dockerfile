FROM node:20-alpine

# Install Docker CLI so the backend can exec into sibling containers
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Expose port 8000
EXPOSE 8000

# Start command for development
CMD ["npm", "run", "start:dev"]
