"use strict";

function decide(sla) {
  const productionReady = !!(sla && sla.productionReady);
  return {
    todayVideoScheduled: !!(sla && sla.scheduled),
    startProduction: !productionReady,
    repairNotification: productionReady && !sla.notificationExists,
    notifyHuman: false,
  };
}

function afterRecovery(sla, recoveryResult) {
  const healthy = !!(sla && sla.healthy);
  return {
    automaticRecoveryStarted: !!(recoveryResult && recoveryResult.started),
    recoverySucceeded: healthy,
    notifyHuman: !!(recoveryResult && recoveryResult.started && !healthy),
  };
}

module.exports = { decide, afterRecovery };
