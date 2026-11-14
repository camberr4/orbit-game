'use strict';
// Coming back and speaking up: an optional reminder once a day (a local notification: nothing leaves the phone), and Google's own
// rating dialog, asked for only after a moment worth rating. Both exist only in the app; in a browser this file does nothing.
OD.engage = (() => {
  const P = () => (window.Capacitor && window.Capacitor.Plugins) || {};
  const native = () => !!(OD.isNative && OD.isNative());
  const LN = () => native() && P().LocalNotifications, RV = () => native() && P().InAppReview;
  const IDS = [101, 102, 103], HOUR = 18, MIN = 30;
  const today = () => OD.dayNumber(OD.todayKey());

  // ---- the reminder: the next three days at half past six in the evening, laid out again on every start and after every run
  // (so a day you have already played is skipped, and the reminders stop by themselves if you stay away)
  async function schedule() {
    const L = LN(); if (!L) return;
    try {
      await L.cancel({ notifications: IDS.map(id => ({ id })) });
      if (!OD.save.settings.remind) return;
      const now = new Date(), dc = OD.daily.state(), playedToday = dc.tier > 0 || OD.save.daily.last === OD.todayKey();
      const bodies = [OD.t('A new daily challenge is ready. Bronze, silver or gold?'), OD.t('Your daily streak is waiting. One run keeps it alive.')];
      const list = [];
      for (let d = 0, n = 0; n < IDS.length && d < 5; d++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, HOUR, MIN, 0);
        if (at - now < 20 * 60000 || (d === 0 && playedToday)) continue;
        list.push({ id: IDS[n], title: 'Halo Run', body: bodies[(today() + d) % bodies.length], schedule: { at, allowWhileIdle: false }, smallIcon: 'ic_stat_halo', iconColor: '#4DF3FF' }); n++;
      }
      if (list.length) await L.schedule({ notifications: list });
    } catch (e) { /* no reminders, then */ }
  }
  // turning it on asks Android for permission (once); a "no" leaves the switch off
  async function setRemind(on) {
    const L = LN(), s = OD.save.settings;
    if (!on || !L) { s.remind = false; OD.persist(); schedule(); return false; }
    let ok = false;
    try { let p = await L.checkPermissions(); if (p.display !== 'granted') p = await L.requestPermissions(); ok = p.display === 'granted'; } catch (e) { ok = false; }
    s.remind = ok; OD.persist(); schedule(); return ok;
  }
  // the one time the game offers it by itself: right after your first daily medal
  function offerRemind() {
    const U = OD.ui.internals; OD.save.remindAsked = true; OD.persist();
    U.openModal(`<div class="card panel dcpanel"><div class="dck">${OD.t('DAILY CHALLENGE')}</div><h2>${OD.t('A new one every day')}</h2><p class="dcsub">${OD.t('Want one reminder a day when the next challenge is ready? You can switch it off in Settings.')}</p><div class="btnrow"><button class="btn" data-act="closemodal">${OD.t('No thanks')}</button><button class="btn primary" data-act="remindyes">${OD.t('Remind me')}</button></div></div>`);
  }
  // ---- the rating: only after a new best in a real run, not in the first days, at most three times ever and months apart
  function reviewDue(r) {
    const sv = OD.save, rv = sv.rv || (sv.rv = { n: 0, last: 0 });
    return !!RV() && r.newBest && r.score >= 3000 && (sv.stats.runs || 0) >= 8 && today() - (sv.firstDay || today()) >= 2 && rv.n < 3 && today() - (rv.last || 0) >= 60;
  }
  function afterRun(r) {
    if (!r) return;
    schedule();
    const wait = fn => setTimeout(() => { if (OD.ui.cur === 'over' && document.getElementById('modal').classList.contains('hidden')) fn(); }, 2600);
    if (LN() && r.dc && r.dc.pay > 0 && !OD.save.remindAsked && !OD.save.settings.remind) { wait(offerRemind); return; }
    if (reviewDue(r)) wait(() => { const sv = OD.save; sv.rv.n++; sv.rv.last = today(); OD.persist(); try { RV().requestReview(); } catch (e) { /* the dialog is Google's to show or not */ } });
  }
  function init() {
    if (!OD.save.firstDay) { OD.save.firstDay = today(); OD.persist(); }
    schedule();
    OD.ui.internals.acts.remind = async (d, b) => { const on = !OD.save.settings.remind; await setRemind(on); OD.ui.internals.redraw(); };
    OD.ui.internals.acts.remindyes = async () => { OD.ui.internals.closeModal(); await setRemind(true); };
  }
  return { init, afterRun, schedule, canRemind: () => !!LN() };
})();
