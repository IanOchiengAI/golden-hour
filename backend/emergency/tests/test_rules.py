from datetime import date

from django.test import SimpleTestCase

from emergency import rules
from emergency.rules import BLOOD_GROUPS, CompatibilityError, compatible_donor_groups

AS_OF = date(2026, 10, 31)


def antigens(group):
    """Red-cell antigens of a group, e.g. 'A+' → {'A', 'D'}."""
    abo = group[:-1]
    s = set() if abo == "O" else set(abo)        # 'AB' → {'A','B'}
    if group.endswith("+"):
        s.add("D")
    return s


def unit(unit_id="U1", group="O+", site="RBTC-NBO", **over):
    u = {
        "unit_id": unit_id, "component": "RBC", "blood_group": group, "status": "in_stock",
        "expiry_date": "2026-11-20", "temp_excursion_exposed": 0,
        "screening_result": "non_reactive", "tested_date": "2026-10-01",
        "current_facility_id": site,
    }
    u.update(over)
    return u


class CompatibilityTableTests(SimpleTestCase):
    def test_red_cells_match_antigen_rule(self):
        # Donor red cells must not carry an antigen the patient lacks.
        for patient in BLOOD_GROUPS:
            expected = [d for d in BLOOD_GROUPS if antigens(d) <= antigens(patient)]
            self.assertEqual(sorted(rules.RED_CELL_DONORS[patient]), sorted(expected), patient)

    def test_red_cells_match_knowledge_base_donor_table(self):
        gives_to = {  # .agents/KNOWLEDGE.md §1
            "O-": BLOOD_GROUPS, "O+": ["O+", "A+", "B+", "AB+"], "A-": ["A-", "A+", "AB-", "AB+"],
            "A+": ["A+", "AB+"], "B-": ["B-", "B+", "AB-", "AB+"], "B+": ["B+", "AB+"],
            "AB-": ["AB-", "AB+"], "AB+": ["AB+"],
        }
        for donor, patients in gives_to.items():
            for patient in BLOOD_GROUPS:
                self.assertEqual(donor in rules.RED_CELL_DONORS[patient], patient in patients, (donor, patient))

    def test_plasma_is_reversed_and_ignores_rhd(self):
        # Donor plasma must not carry antibodies to the patient's A/B antigens.
        for patient in BLOOD_GROUPS:
            need = antigens(patient) - {"D"}
            expected = [d for d in BLOOD_GROUPS if need <= antigens(d)]
            self.assertEqual(sorted(rules.PLASMA_DONORS[patient]), sorted(expected), patient)

    def test_rbc_examples(self):
        self.assertEqual(compatible_donor_groups("O-", "RBC"), (["O-"], []))
        self.assertEqual(set(compatible_donor_groups("AB+", "RBC")[0]), set(BLOOD_GROUPS))

    def test_ffp_examples(self):
        self.assertEqual(compatible_donor_groups("AB+", "FFP")[0], ["AB-", "AB+"])
        self.assertEqual(set(compatible_donor_groups("O-", "FFP")[0]), set(BLOOD_GROUPS))

    def test_platelets_abo_plasma_rule_and_rhd_negative(self):
        self.assertEqual(compatible_donor_groups("A-", "PLT")[0], ["A-", "AB-"])
        self.assertEqual(compatible_donor_groups("A+", "PLT")[0], ["A-", "A+", "AB-", "AB+"])


class UnknownGroupTests(SimpleTestCase):
    def test_unknown_red_cells_get_o_negative_with_warning(self):
        groups, warnings = compatible_donor_groups("unknown", "RBC")
        self.assertEqual(groups, ["O-"])
        self.assertEqual(len(warnings), 1)
        self.assertIn("O−", warnings[0])

    def test_unknown_plasma_gets_ab_with_warning(self):
        groups, warnings = compatible_donor_groups("unknown", "FFP")
        self.assertEqual(groups, ["AB-", "AB+"])
        self.assertIn("AB", warnings[0])

    def test_unknown_platelets_refused(self):
        with self.assertRaises(CompatibilityError):
            compatible_donor_groups("unknown", "PLT")

    def test_bad_inputs_refused(self):
        with self.assertRaises(CompatibilityError):
            compatible_donor_groups("C+", "RBC")
        with self.assertRaises(CompatibilityError):
            compatible_donor_groups("O+", "WB")


class UnitFilterTests(SimpleTestCase):
    def check(self, u, held=frozenset()):
        return rules.check_unit(u, component="RBC", donor_groups=["O-", "O+"], as_of=AS_OF, held_unit_ids=held)

    def test_safe_unit_passes(self):
        self.assertIsNone(self.check(unit()))

    def test_each_exclusion(self):
        cases = {
            rules.WRONG_COMPONENT: unit(component="FFP"),
            rules.INCOMPATIBLE: unit(group="A+"),
            rules.NOT_IN_STOCK: unit(status="transfused"),
            rules.TEMP_EXCURSION: unit(temp_excursion_exposed=1),
            rules.EXPIRED: unit(expiry_date="2026-10-30"),
            rules.UNTESTED: unit(tested_date=None),
        }
        for reason, u in cases.items():
            self.assertEqual(self.check(u), reason, reason)
        self.assertEqual(self.check(unit(screening_result="reactive")), rules.UNTESTED)
        self.assertEqual(self.check(unit(), held={"U1"}), rules.ALREADY_HELD)

    def test_expiry_uses_data_as_of_date(self):
        self.assertEqual(self.check(unit(expiry_date="2026-10-31")), rules.EXPIRED)   # expires on the day
        self.assertIsNone(self.check(unit(expiry_date="2026-11-01")))

    def test_filter_counts_exclusions(self):
        safe, excluded = rules.filter_units(
            [unit("a"), unit("b", temp_excursion_exposed=True), unit("c", expiry_date="2026-01-01")],
            component="RBC", donor_groups=["O+"], as_of=AS_OF,
        )
        self.assertEqual([u["unit_id"] for u in safe], ["a"])
        self.assertEqual(excluded, {rules.TEMP_EXCURSION: 1, rules.EXPIRED: 1})


class PickAndSufficiencyTests(SimpleTestCase):
    def test_exact_group_first_then_fefo_and_o_negative_last(self):
        units = [
            unit("oneg", "O-", expiry_date="2026-11-02"),
            unit("opos-late", "O+", expiry_date="2026-12-01"),
            unit("apos-late", "A+", expiry_date="2026-12-01"),
            unit("apos-soon", "A+", expiry_date="2026-11-05"),
        ]
        picked = rules.pick_units(units, 4, "A+", "RBC")
        self.assertEqual([u["unit_id"] for u in picked], ["apos-soon", "apos-late", "opos-late", "oneg"])

    def test_o_negative_patient_is_not_deprioritised(self):
        picked = rules.pick_units([unit("x", "O-")], 1, "O-", "RBC")
        self.assertEqual(picked[0]["unit_id"], "x")

    def test_offers_skip_requester_and_mark_partial(self):
        units = [unit("a", site="RBTC-NBO"), unit("b", site="RBTC-NBO"),
                 unit("c", site="SAT-MKS"), unit("d", site="HSP-002")]
        offers = {o.facility_id: o for o in rules.build_site_offers(
            units, units_requested=2, patient_group="O+", component="RBC", requesting_facility_id="HSP-002")}
        self.assertEqual(set(offers), {"RBTC-NBO", "SAT-MKS"})
        self.assertFalse(offers["RBTC-NBO"].is_partial(2))
        self.assertTrue(offers["SAT-MKS"].is_partial(2))
        self.assertEqual(len(offers["RBTC-NBO"].picked), 2)

    def test_offers_respect_allowed_suppliers(self):
        offers = rules.build_site_offers(
            [unit("a", site="HSP-001"), unit("b", site="RBTC-NBO")], units_requested=1,
            patient_group="O+", component="RBC", requesting_facility_id="HSP-002",
            allowed_facility_ids={"RBTC-NBO"})
        self.assertEqual([o.facility_id for o in offers], ["RBTC-NBO"])
