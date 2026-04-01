const os = require('os');

let previousCpuUsage = process.cpuUsage();
let previousSampleTime = process.hrtime.bigint();

function getRamUsagePercent() {
  const rss = process.memoryUsage().rss;
  const totalMemory = os.totalmem();

  if (!totalMemory) {
    return 0;
  }

  return Number(((rss / totalMemory) * 100).toFixed(2));
}

function getCpuUsagePercent() {
  const currentCpuUsage = process.cpuUsage();
  const currentSampleTime = process.hrtime.bigint();
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

  return Number(Math.max(0, cpuPercent).toFixed(2));
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