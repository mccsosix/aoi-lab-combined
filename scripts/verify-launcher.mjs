import fs from 'node:fs';

const bat = fs.readFileSync(new URL('../start.bat', import.meta.url), 'utf8');
const failures = [];

if (/call\s+:is_our_app/i.test(bat)) {
  failures.push('start.bat still reuses any existing AOI LAB service on the default port');
}
if (!/Port %APP_PORT% is in use[\s\S]*find_free_port/i.test(bat)) {
  failures.push('busy-port branch must choose a free port for the current extracted project');
}
if (!/04 Repeatability/i.test(bat) || !/05 Correlation/i.test(bat)) {
  failures.push('launcher should print the integrated feature marker so users can identify the corrected package');
}

if (failures.length) {
  console.error('Launcher verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Launcher verification passed.');
