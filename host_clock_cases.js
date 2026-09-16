// Shared scenarios for the host-clock merge rule (X-Live v0.36 / Platform v210).
module.exports = function (merge, check) {
  const T0 = 1000;
  const base = () => ({ id: 'S', status: 'active', title: 'Show', currentSlideIndex: 0, hostControls: { paused: false, responsesLocked: false },
    hostUpdatedAt: T0, updatedAt: T0, liveParticipants: [], awardedTo: [], raceEvents: [],
    slides: [{ id: 'a', revealed: false, responses: {} }, { id: 'b', revealed: false, responses: {} }] });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // host moves on + pauses + reveals at T=2000
  const cloud = clone(base());
  cloud.currentSlideIndex = 1; cloud.hostControls.paused = true; cloud.slides[0].revealed = true;
  cloud.hostUpdatedAt = 2000; cloud.updatedAt = 2000;
  // player answers from its stale copy at T=3000
  const player = clone(base());
  player.slides[0].responses.p1 = { value: 2, at: 3000 };
  player.liveParticipants.push({ id: 'p1', joinedAt: 3000 });
  player.raceEvents.push({ id: 'r1', pid: 'p1' });
  player.updatedAt = 3000;
  let m = merge(player, cloud);
  check('stale player save keeps the host\'s NEXT', m.currentSlideIndex === 1, m.currentSlideIndex);
  check('stale player save keeps the host\'s PAUSE', m.hostControls.paused === true);
  check('stale player save keeps the host\'s REVEAL', m.slides[0].revealed === true);
  check('the player\'s answer, join and purchase still land', m.slides[0].responses.p1 && m.slides[0].responses.p1.value === 2 && m.liveParticipants.length === 1 && m.raceEvents.length === 1);
  check('merged stamps: newest of each clock', m.updatedAt === 3000 && m.hostUpdatedAt === 2000, [m.updatedAt, m.hostUpdatedAt]);
  // same scenario seen from the player's poll (local = stale player copy, incoming = cloud)
  m = merge(clone(base()), clone(m));
  check('a player poll also takes the host\'s state', m.currentSlideIndex === 1 && m.hostControls.paused === true);
  // host's newer action wins over the cloud
  const host = clone(cloud); host.currentSlideIndex = 0; host.hostControls.paused = false; host.hostUpdatedAt = 4000; host.updatedAt = 4000;
  m = merge(host, cloud);
  check('a newer host action still wins', m.currentSlideIndex === 0 && m.hostControls.paused === false);
  // an older host copy loses to a newer co-host write even if its updatedAt is newer
  const coHost = clone(cloud); coHost.hostUpdatedAt = 5000; coHost.currentSlideIndex = 1; coHost.updatedAt = 5000;
  const staleHostPoll = clone(base()); staleHostPoll.updatedAt = 6000;
  m = merge(staleHostPoll, coHost);
  check('the newest host clock wins between hosts', m.currentSlideIndex === 1);
  // legacy sessions (no host clock anywhere) keep last-write-wins
  const a = clone(base()); delete a.hostUpdatedAt; a.title = 'A'; a.updatedAt = 10;
  const b = clone(base()); delete b.hostUpdatedAt; b.title = 'B'; b.updatedAt = 20;
  m = merge(a, b);
  check('legacy sessions: newer updatedAt still wins', m.title === 'B' && m.hostUpdatedAt === undefined);
  // terminal status still wins from either side
  const ended = clone(base()); ended.status = 'ended';
  m = merge(player, ended);
  check('ended still wins over an active copy', m.status === 'ended');
  // non-terminal status follows the host clock
  const sched = clone(base()); sched.status = 'scheduled'; sched.updatedAt = 9000; // stale player-side copy, newer updatedAt
  m = merge(sched, cloud);
  check('a stale "scheduled" copy can\'t knock a live session back', m.status === 'active');
};
