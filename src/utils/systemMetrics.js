const os = require('os');

let previousCpuUsage = null;
let previousSampleTime = null;

function normalizePercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(Math.min(100, Math.max(0, value)).toFixed(2));
}

function getRamUsagePercent() {
  const rss = process.memoryUsage().rss;
  const totalMemory = os.totalmem();

  if (!totalMemory) {
    return 0;
  }

  return normalizePercent((rss / totalMemory) * 100);
}

function getCpuUsagePercent() {
  const currentCpuUsage = process.cpuUsage();
  const currentSampleTime = process.hrtime.bigint();

  if (!previousCpuUsage || !previousSampleTime) {
    previousCpuUsage = currentCpuUsage;
    previousSampleTime = currentSampleTime;
    return 0;
  }

  const elapsedMicros = Number(currentSampleTime - previousSampleTime) / 1000;
  const cpuCount = os.cpus()?.length || 1;

  if (elapsedMicros <= 0) {
    return 0;
  }

  const deltaUser = currentCpuUsage.user - previousCpuUsage.user;
  const deltaSystem = currentCpuUsage.system - previousCpuUsage.system;
  const cpuPercent = ((deltaUser + deltaSystem) / (elapsedMicros * cpuCount)) * 100;

  previousCpuUsage = currentCpuUsage;
  previousSampleTime = currentSampleTime;

  return normalizePercent(cpuPercent);
}

function getSystemMetrics() {
  return {
    cpu: getCpuUsagePercent(),
    ram: getRamUsagePercent(),
  };
}

module.exports = {
  getSystemMetrics,
};
