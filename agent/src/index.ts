import { Hono } from 'hono';
import { chatWithAI } from './agent';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.post('/chat', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  const response = await chatWithAI(prompt);
  return c.json(response);
});

export default app;
