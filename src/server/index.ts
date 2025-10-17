import express from 'express';
import { InitResponse, IncrementResponse, DecrementResponse, BossStatusResponse, BossAttackResponse } from '../shared/types/api';
import { redis, createServer, context } from '@devvit/web/server';
import { createPost } from './core/post';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
      return;
    }

    try {
      const count = await redis.get('count');
      res.json({
        type: 'init',
        postId: postId,
        count: count ? parseInt(count) : 0,
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, IncrementResponse | { status: string; message: string }, unknown>(
  '/api/increment',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', 1),
      postId,
      type: 'increment',
    });
  }
);

router.post<{ postId: string }, DecrementResponse | { status: string; message: string }, unknown>(
  '/api/decrement',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', -1),
      postId,
      type: 'decrement',
    });
  }
);

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// --- Community Boss Endpoints ---
const BOSS_ID = 'global-boss-1';
const BOSS_HP_KEY = `boss:${BOSS_ID}:hp`;
const BOSS_MAX_HP = 1000;

router.get<{}, BossStatusResponse | { status: string; message: string }>(
  '/api/boss/status',
  async (_req, res): Promise<void> => {
    try {
      const hpRaw = await redis.get(BOSS_HP_KEY);
      const hp = hpRaw ? parseInt(hpRaw) : BOSS_MAX_HP;
      if (!hpRaw) {
        await redis.set(BOSS_HP_KEY, `${BOSS_MAX_HP}`);
      }
      res.json({ type: 'boss_status', bossId: BOSS_ID, hp, maxHp: BOSS_MAX_HP });
    } catch (error) {
      console.error('Boss status error', error);
      res.status(400).json({ status: 'error', message: 'Failed to fetch boss status' });
    }
  }
);

router.post<{}, BossAttackResponse | { status: string; message: string }, { amount?: number }>(
  '/api/boss/attack',
  async (req, res): Promise<void> => {
    try {
      const amount = Math.max(1, Math.min(25, Number(req.body?.amount ?? 10)));
      let hpRaw = await redis.get(BOSS_HP_KEY);
      let hp = hpRaw ? parseInt(hpRaw) : BOSS_MAX_HP;
      if (!hpRaw) {
        await redis.set(BOSS_HP_KEY, `${BOSS_MAX_HP}`);
        hp = BOSS_MAX_HP;
      }
      const newHp = Math.max(0, hp - amount);
      await redis.set(BOSS_HP_KEY, `${newHp}`);
      res.json({ type: 'boss_attack', bossId: BOSS_ID, hp: newHp, maxHp: BOSS_MAX_HP, amount });
    } catch (error) {
      console.error('Boss attack error', error);
      res.status(400).json({ status: 'error', message: 'Failed to apply boss attack' });
    }
  }
);

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = process.env.WEBBIT_PORT || 3000;

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port, () => console.log(`http://localhost:${port}`));
