"""
Free-trial enforcement.

The clock starts the first time this deployment ever boots (stamped once by
migrations.seed_trial_start_date — covers both a fresh /setup/initialize
install and an already-seeded database that's only now getting this feature).
Once trialDurationDays have elapsed:
  - every API request gets rejected (auth_deps.get_current_user checks this
    for every protected route, and auth.login checks it before issuing a
    token), and
  - every user account gets is_active=False (scheduler.scheduled_trial_check_job).

This is a soft lock, not a kill switch: the server process keeps running, so
the operator (not the client running the deployment) can lift it by pushing
trialStartDate forward directly in the database — the same kind of direct fix
used elsewhere in this codebase's operational playbook. There's deliberately
no in-app way to extend it; a trial a logged-in user could remove themselves
wouldn't be much of a trial.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from .models import SystemSetting

DEFAULT_TRIAL_DAYS = 20

# Single on/off switch for this deployment. Both trial_status() (what the
# login page displays, including its full-page "trial ended" block) and
# is_trial_expired() (what actually blocks API access) read this same flag,
# so there's no way for one to say "disabled" while the other still locks
# people out — that split is exactly what happened before this was unified:
# is_trial_expired() was hardcoded off, but /setup/trial (trial_status())
# kept computing the real elapsed-time answer and showing it as expired.
# Flip this back to True to re-enable enforcement for this deployment.
TRIAL_ENFORCEMENT_DISABLED = True


def _get_setting(db: Session, key: str, default=None):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def trial_status(db: Session) -> dict:
    duration_days = _get_setting(db, "trialDurationDays", DEFAULT_TRIAL_DAYS) or DEFAULT_TRIAL_DAYS
    start_str = _get_setting(db, "trialStartDate", "")

    if TRIAL_ENFORCEMENT_DISABLED:
        return {"expired": False, "daysRemaining": duration_days, "trialDurationDays": duration_days, "trialStartDate": start_str or None}

    if not start_str:
        # Not stamped yet (shouldn't happen once migrations have run) — treat as
        # not expired rather than locking everyone out over a missing setting.
        return {"expired": False, "daysRemaining": duration_days, "trialDurationDays": duration_days, "trialStartDate": None}

    try:
        start = datetime.strptime(start_str, "%Y-%m-%d %H:%M")
    except ValueError:
        return {"expired": False, "daysRemaining": duration_days, "trialDurationDays": duration_days, "trialStartDate": start_str}

    elapsed_days = (datetime.utcnow() - start).total_seconds() / 86400
    remaining = duration_days - elapsed_days
    return {
        "expired": remaining <= 0,
        "daysRemaining": max(0, int(remaining) + (1 if remaining > int(remaining) else 0)),
        "trialDurationDays": duration_days,
        "trialStartDate": start_str,
    }


def is_trial_expired(db: Session) -> bool:
    return trial_status(db)["expired"]
