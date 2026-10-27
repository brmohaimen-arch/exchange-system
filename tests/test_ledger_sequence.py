"""Regression tests for the daily-ledger builder (app.routers.business._ledger_sequence).

Run from the project folder (standard library only, no pytest needed):

    python -m unittest discover -s tests -v

Why these exist: cancelling or editing a bank/vault entry marks its movement "reversed" and puts the money back
on the live balance WITHOUT recording a counter-movement. The statements hide the cancelled movement, so the
recorded balances of the rows that remain no longer join up. The ledger must explain that with the hidden
movements and print a "manual adjustment" line ONLY for a balance that really changed by hand. Each scenario
below is a real way this went wrong; the random simulation at the end checks the same rule on thousands of
generated histories.
"""
import os
import random
import sys
import unittest
from types import SimpleNamespace as N

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from app.routers import business as b  # noqa: E402


def mv(ts, before, delta, hidden=False, tag=""):
    return N(timestamp=ts, balance_before=before, balance_after=before + delta, amount_in=max(delta, 0.0), amount_out=max(-delta, 0.0),
             id=tag or ts, currency="LYD", entity_name="x", details=None, type="t", user="u", hidden=hidden)


_clock = [1790000000000]


def real_id(prefix):
    """An id built like new_id(): prefix, creation time in milliseconds, random tail."""
    _clock[0] += 7
    return "%s_%d_ab12cd" % (prefix, _clock[0])


def build(history):
    shown = [m for m in history if not m.hidden]
    hidden = [m for m in history if m.hidden]
    lines = b._ledger_sequence(shown, None, hidden)
    rows = [l for l in lines if l["m"] is not None]
    adjustments = [round(l["in"] - l["out"], 2) for l in lines if l["m"] is None]
    return lines, rows, adjustments


def joins_up(lines):
    """Every line starts where the previous one ended."""
    return all(abs(lines[i]["after"] - (lines[i - 1]["after"] + lines[i]["in"] - lines[i]["out"])) < 0.01 for i in range(1, len(lines)))


class Scenarios(unittest.TestCase):
    def check(self, history, final, adjustments=()):
        lines, rows, adj = build(history)
        self.assertEqual(adj, list(adjustments))
        self.assertAlmostEqual(lines[-1]["after"], final, places=2)
        self.assertTrue(joins_up(lines))
        return rows

    def test_reversed_before_the_next_row(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("04", 100, 30)], 130)

    def test_reversed_after_a_later_row(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("03", 150, 30), mv("05", 130, 10)], 140)

    def test_edit_is_reverse_then_recreate(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("04", 100, 60)], 160)

    def test_real_manual_change_is_one_adjustment(self):
        self.check([mv("01", 0, 100), mv("03", 125, 10)], 135, [25.0])

    def test_cancelled_the_old_way_balance_kept(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("03", 150, 30)], 130)

    def test_settled_pair_with_counter_movement(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("02", 150, -50, True), mv("03", 100, 30)], 130)

    def test_same_amount_posted_cancelled_and_reposted(self):
        self.check([mv("01", 0, 1000), mv("02", 1000, -500, True), mv("03", 500, 20), mv("05", 1020, -500)], 520)

    def test_two_hidden_movements_undone_later(self):
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("03", 150, 20, True), mv("04", 170, 5), mv("06", 105, 7)], 112)

    def test_hidden_plus_manual_in_one_stretch_is_not_guessed(self):
        # not separable: kept as ONE line rather than hiding a real change
        self.check([mv("01", 0, 100), mv("02", 100, 50, True), mv("04", 175, 10)], 185, [75.0])

    def test_hidden_movements_before_the_first_shown_row(self):
        # two manual entries (93 + 200) are cancelled later: the account really starts at 0, not at 293
        history = [mv("01", 0, 93, True), mv("02", 93, 200, True), mv("03", 293, 50), mv("05", 343, 10), mv("09", 60, 5)]
        rows = self.check(history, 65)
        self.assertEqual(rows[0]["before"], 0)

    def test_real_account_chain_from_the_server(self):
        """The Manara account: opening 293,000 and two false adjustments (-493,000 / +200,000) appeared on its PDF."""
        R = [("2026-10-20 20:24", "i", 93000, 0, 1), ("2026-10-20 20:25", "i", 200000, 93000, 1), ("2026-10-20 21:18", "i", 143800, 293000, 0),
             ("2026-10-20 21:18", "i", 200000, 436800, 0), ("2026-10-24 17:20", "i", 50000, 636800, 0), ("2026-10-24 17:20", "o", 50000, 686800, 0),
             ("2026-10-24 18:00", "i", 143800, 636800, 1), ("2026-10-24 18:00", "i", 200000, 780600, 1), ("2026-10-24 18:00", "i", 93000, 980600, 1),
             ("2026-10-24 18:01", "i", 200000, 1073600, 1), ("2026-10-24 18:01", "i", 512500, 1273600, 0), ("2026-10-24 18:02", "i", 150000, 1786100, 1),
             ("2026-10-24 18:04", "o", 1019000, 1936100, 0), ("2026-10-24 18:05", "i", 115000, 917100, 0), ("2026-10-24 18:06", "i", 100000, 1032100, 0),
             ("2026-10-24 18:08", "o", 439200, 1132100, 0), ("2026-10-24 18:08", "i", 86000, 692900, 0), ("2026-10-24 18:15", "o", 150000, -7900, 0),
             ("2026-10-24 19:00", "o", 65871, -157900, 0), ("2026-10-24 19:02", "o", 93000, -223771, 1), ("2026-10-24 19:02", "o", 200000, -316771, 1),
             ("2026-10-24 19:03", "i", 93000, -716771, 0), ("2026-10-24 19:03", "i", 200000, -423771, 0), ("2026-10-25 17:48", "i", 241500, -223771, 0),
             ("2026-10-26 18:01", "i", 500000, 17729, 1), ("2026-10-26 18:02", "i", 500000, 517729, 0), ("2026-10-26 18:02", "i", 500000, 517729, 0),
             ("2026-10-26 20:09", "i", 30000, 1017729, 0)]
        history = [mv(ts, bef, amt if kind == "i" else -amt, bool(hid), tag="m%d" % i) for i, (ts, kind, amt, bef, hid) in enumerate(R)]
        rows = self.check(history, 1047729)
        self.assertEqual(rows[0]["before"], 0)
        self.assertEqual(sum(r["in"] for r in rows), 2771800)
        self.assertEqual(sum(r["out"] for r in rows), 1724071)

    def test_real_account_chain_dakshi(self):
        """Two 10,000 lines appeared: a withdrawal edited a day later (its reversal returned the money without a movement)."""
        history = [mv("2026-10-12 18:42", 15946502, -10030000), mv("2026-10-12 18:43", 5916502, -10000, True), mv("2026-10-12 18:45", 5906502, -3000000),
                   mv("2026-10-13 19:03", 1020982, -1003000), mv("2026-10-13 20:32", 27982, -1000)]
        # (the rows in between are left out here, so their gap is real; only the two 10,000 lines are asserted)
        _lines, _rows, adj = build(history)
        self.assertNotIn(10000.0, adj)
        self.assertNotIn(-10000.0, adj)


class Simulation(unittest.TestCase):
    """Generates histories the way the application really behaves and checks the ledger on each of them.

    Behaviour modelled (see _reverse_movement_entries / _edit_movement_entries):
      add      a movement is recorded: balance_before = live balance, balance_after = live balance +/- amount
      cancel   the movement is marked reversed and the live balance is put back. Today a hidden counter-movement
               is recorded too (counter=True); older data has none (counter=False) and the ledger has to infer it.
      edit     = cancel + add
      manual   the live balance is changed by hand with no movement (the banks page balance field)
    """

    @staticmethod
    def simulate(rng, steps, allow_manual, allow_cancel, counter=True, same_minute=False, realistic_amounts=False, ids_with_time=True):
        balance = 0.0
        history, active = [], []
        manual_total = 0.0
        minute = 0

        def stamp():
            nonlocal minute
            minute += 0 if (same_minute and rng.random() < 0.35) else 1
            return "2026-10-%02d %02d:%02d" % (1 + minute // 1440, (minute // 60) % 24, minute % 60)

        def add(amount):
            nonlocal balance
            m = mv(stamp(), balance, amount, tag=real_id("m") if ids_with_time else "m%d" % len(history))
            balance += amount
            history.append(m)
            active.append(m)

        def cancel(m):
            nonlocal balance
            delta = m.amount_in - m.amount_out
            if counter:
                history.append(mv(stamp(), balance, -delta, True, tag=real_id("m_rev_" + m.id) if ids_with_time else "c%d" % len(history)))
            balance -= delta                              # the money is put back
            m.hidden = True
            active.remove(m)

        def pick_amount():
            if realistic_amounts:
                return float(rng.randint(1, 900000)) * rng.choice([1, -1])
            return float(rng.choice([10, 25, 50, 100, 250, 500, 1000, 7, 13, 99])) * rng.choice([1, -1])

        add(pick_amount())                                # an account always starts with a movement
        for _ in range(steps):
            r = rng.random()
            amount = pick_amount()
            if r < 0.55 or not active:
                add(amount)
            elif allow_cancel and r < 0.75:
                cancel(rng.choice(active))
            elif allow_cancel and r < 0.9:
                cancel(rng.choice(active))                # an edit: cancel the old entry ...
                add(amount)                               # ... and create the corrected one
            elif allow_manual:
                delta = float(rng.choice([40, 60, 80, 120, 330])) * rng.choice([1, -1])
                balance += delta
                manual_total += delta
            else:
                add(amount)
        if allow_manual:
            add(pick_amount())                            # a manual change only shows once a later row exists
        return history, balance, manual_total

    def run_case(self, seed, allow_manual, allow_cancel, **kw):
        rng = random.Random(seed)
        history, balance, manual_total = self.simulate(rng, rng.randint(3, 40), allow_manual, allow_cancel, **kw)
        if not [m for m in history if not m.hidden]:
            return None
        lines, rows, adjustments = build(history)
        return history, balance, manual_total, lines, rows, adjustments

    def failures(self, n, allow_manual, allow_cancel, **kw):
        bad = []
        for seed in range(n):
            out = self.run_case(seed, allow_manual, allow_cancel, **kw)
            if out is None:
                continue
            history, balance, manual_total, lines, rows, adjustments = out
            expected = round(manual_total, 2)
            ok = (abs(sum(adjustments) - expected) < 0.01 and (allow_manual or not adjustments)
                  and abs(lines[-1]["after"] - balance) < 0.01 and rows[0]["before"] == 0 and joins_up(lines))
            if not ok:
                bad.append((seed, adjustments, round(lines[-1]["after"], 2), round(balance, 2)))
        return bad

    def test_a_cancellation_with_its_counter_movement_never_creates_an_adjustment(self):
        """What the application records today: every cancelled entry also leaves a hidden counter-movement."""
        bad = self.failures(4000, allow_manual=False, allow_cancel=True, counter=True)
        self.assertEqual(bad[:5], [], "%d of 4000 histories wrongly produced an adjustment or a wrong balance" % len(bad))

    def test_the_same_with_several_movements_in_one_minute(self):
        """Ids carry their creation time, which settles the order inside a minute exactly."""
        bad = self.failures(3000, allow_manual=False, allow_cancel=True, counter=True, same_minute=True)
        self.assertEqual(bad[:5], [], "%d of 3000 histories failed" % len(bad))

    def test_one_minute_without_creation_times_in_the_ids_falls_back_to_the_balance_chain(self):
        """Ids from imported/seed data may carry no creation time: the balance chain is used. A movement and its
        exact opposite starting from the same balance cannot be told apart that way, so a small tolerance."""
        bad = self.failures(3000, allow_manual=False, allow_cancel=True, counter=True, same_minute=True, ids_with_time=False)
        self.assertLessEqual(len(bad), 30, "chain fallback regressed: %d of 3000 failed, e.g. %s" % (len(bad), bad[:3]))

    def test_only_real_manual_changes_are_reported(self):
        bad = self.failures(4000, allow_manual=True, allow_cancel=False)
        self.assertEqual(bad[:5], [], "%d of 4000 histories mis-reported a manual change" % len(bad))

    def test_older_data_without_counter_movements_with_realistic_amounts(self):
        """History recorded before counter-movements existed: the ledger infers the reversal. Realistic (distinct)
        amounts must be resolved; only coincidences of identical amounts can be ambiguous, so a tiny tolerance."""
        bad = self.failures(4000, allow_manual=False, allow_cancel=True, counter=False, realistic_amounts=True)
        self.assertLessEqual(len(bad), 40, "older-data inference regressed: %d of 4000 failed, e.g. %s" % (len(bad), bad[:3]))

    def test_cancelled_entries_never_appear_in_the_ledger(self):
        for seed in range(1500):
            out = self.run_case(seed, allow_manual=False, allow_cancel=True)
            if out is None:
                continue
            history, _, _, lines, rows, _ = out
            self.assertEqual({r["m"].id for r in rows}, {m.id for m in history if not m.hidden})


if __name__ == "__main__":
    unittest.main()
