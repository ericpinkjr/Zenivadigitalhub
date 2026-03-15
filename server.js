import app from './src/app.js';
import { PORT } from './src/config/env.js';
import { startMetaSyncCron } from './src/jobs/metaSyncCron.js';
import { startContentPublishCron } from './src/jobs/contentPublishCron.js';

app.listen(PORT, () => {
  console.log(`Zeniva Digital Hub API running on port ${PORT}`);
  startMetaSyncCron();
  startContentPublishCron();
});
