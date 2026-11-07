import { asSystem } from './db';
import { deleteEvidence } from './storage';

const days = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** How long each kind of data is kept. Each can be changed with an environment variable. */
export const RETENTION = {
  otpDays: 1,
  evidenceDays: days('RETENTION_EVIDENCE_DAYS', 90), // after the case is closed
  communityDays: days('RETENTION_COMMUNITY_DAYS', 30),
  visitorDays: days('RETENTION_VISITOR_DAYS', 180),
  notificationDays: days('RETENTION_NOTIFICATION_DAYS', 180),
  passDays: days('RETENTION_PASS_DAYS', 90), // after the pass expires
  auditDays: 730, // fixed: matches the database rule protecting the audit log
};

const EVERY_HOURS = 6;
let lastCheck = 0;

/**
 * Deletes personal data that is past its keep-by date. Safe to call often: it only
 * does work every 6 hours and only one server instance runs it at a time.
 */
export async function runRetention(force = false): Promise<Record<string, number> | null> {
  const r = RETENTION;
  const result = await asSystem(async (tx) => {
    const lock = await tx.one(`select pg_try_advisory_xact_lock(724502) as ok`);
    if (!lock?.ok) return null;
    if (!force) {
      const due = await tx.one(
        `select coalesce(max(last_run_at) < now() - make_interval(hours => $1), true) as due
           from safenest_jobs where name = 'retention'`,
        [EVERY_HOURS],
      );
      if (!due?.due) return null;
    }
    const count = async (sql: string, params: unknown[] = []) => (await tx.all(sql, params)).length;
    const files: string[] = [];

    const otp = await count(`delete from auth.otp_codes where created_at < now() - make_interval(days => $1) returning 1`, [r.otpDays]);

    const ev = await tx.all(
      `delete from sos_evidence e using sos_alerts a
        where a.id = e.alert_id
          and a.status in ('resolved', 'false_alarm') and a.police_status in ('new', 'closed')
          and coalesce(a.resolved_at, a.created_at) < now() - make_interval(days => $1)
        returning e.storage_path as k`,
      [r.evidenceDays],
    );
    files.push(...ev.map((x) => x.k));

    const cm = await tx.all(
      `delete from community_alerts where created_at < now() - make_interval(days => $1) returning photo_path as k`,
      [r.communityDays],
    );
    files.push(...cm.map((x) => x.k).filter(Boolean));

    const visitors = await count(`delete from visitor_logs where entry_at < now() - make_interval(days => $1) returning 1`, [r.visitorDays]);
    const notifications = await count(`delete from notification_log where created_at < now() - make_interval(days => $1) returning 1`, [r.notificationDays]);
    const passes = await count(
      `delete from guest_passes where valid_until < now() - make_interval(days => $1) returning 1`,
      [r.passDays],
    );
    const audit = await count(`delete from police_audit_log where created_at < now() - make_interval(days => $1) returning 1`, [r.auditDays + 1]);

    const out = { otp, evidence: ev.length, community: cm.length, visitors, notifications, passes, audit };
    await tx.all(
      `insert into safenest_jobs (name, last_run_at, last_result) values ('retention', now(), $1)
       on conflict (name) do update set last_run_at = now(), last_result = excluded.last_result`,
      [JSON.stringify(out)],
    );
    return { out, files };
  });
  if (!result) return null;
  await deleteEvidence(result.files);
  return result.out;
}

/** Opportunistic trigger: checks at most every 10 minutes per server instance, never throws. */
export async function maybeRunRetention(): Promise<void> {
  if (Date.now() - lastCheck < 10 * 60_000) return;
  lastCheck = Date.now();
  try {
    const out = await runRetention();
    if (out) console.log('SafeNest retention', JSON.stringify(out));
  } catch (e) {
    console.error('SafeNest retention failed', e);
  }
}
