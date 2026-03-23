FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Expose port (Vite's default or custom)
EXPOSE 3000

# Start command
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
