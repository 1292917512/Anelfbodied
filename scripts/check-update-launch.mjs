import { installUpdate } from '../src/host/install-update.ts';

await installUpdate(process.argv[2], process.argv[3]);
console.log('Upgrade installer launched.');
