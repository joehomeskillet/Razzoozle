import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { readFileSync } from 'fs';

export function newStagehand() {
  const stagehand = new Stagehand({
    env: 'LOCAL',
    model: {
      modelName: 'mistral/mistral-small-latest',
      apiKey: readFileSync('/root/.mistral-key', 'utf8').trim(),
    },
    cacheDir: '.stagehand-cache',
    localBrowserLaunchOptions: {
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--headless=new'],
    },
  });
  
  return stagehand;
}
