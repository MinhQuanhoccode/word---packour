# Monorepo Deployment Guide

## 1. Local Setup & Build
- Run `pnpm install` at root directory to install dependencies for all packages.
- Run `pnpm build` to compile TypeScript across all packages.

## 2. Database Setup (Supabase PostgreSQL)
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Under **Project Settings > Database**, find your **Connection String (URI)**.
3. Update your `.env` file with your `DATABASE_URL`:
   `DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres"`

## 3. Server Hosting (Render / Railway)
1. Push your repository to GitHub.
2. Link your GitHub repository to Render or Railway.
3. Set the following environment variables on your host platform:
   - `PORT`: `2567` (or default assigned by host)
   - `CLIENT_URL`: Your deployed client URL
   - `DATABASE_URL`: Your Supabase connection string
   - `JWT_SECRET`: Your secret key
4. Configure Build and Start commands:
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm --filter @project/server start`
